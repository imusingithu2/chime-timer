/* ui-chimes.js - the "Chimes" list on the main screen and the add/edit sheet. */
(function () {
  'use strict';
  var CT = (window.CT = window.CT || {});
  var E = window.ChimeEngine, U = CT.ui, h = U.h, Sheet = U.Sheet;

  function fmt(ms) { return E.formatDuration(ms); }

  /* A grouped-list row with a label on the left and controls on the right. */
  function formRow(label) {
    var kids = Array.prototype.slice.call(arguments, 1);
    return h('div', { class: 'row' }, h('span', { class: 'row-main', text: label }), kids);
  }

  /* ---------------- list ---------------- */
  function render(container, app) {
    var d = app.draft;
    container.innerHTML = '';

    var items = d.chimes.map(function (c, i) {
      return { c: c, i: i, valid: E.isValidChime(c, d.totalMs), at: E.chimeAt(c, d.totalMs) };
    });
    items.sort(function (a, b) {
      if (a.valid !== b.valid) return a.valid ? -1 : 1;
      return a.valid ? a.at - b.at : a.i - b.i;
    });
    var seen = {};
    items.forEach(function (it) { if (it.valid) seen[it.at] = (seen[it.at] || 0) + 1; });

    if (!items.length) {
      container.appendChild(h('div', { class: 'row row-empty', text: 'No chimes. A chime rings at a time you choose inside the timer.' }));
    }

    items.forEach(function (it) {
      var c = it.c, dup = it.valid && seen[it.at] > 1;
      var sub = it.valid
        ? c.ringSeconds + ' s · ' + c.sound + (dup ? ' · same time as another chime, rings once' : '')
        : 'Outside timer · will be skipped';
      var text = h('span', { class: 'row-main' },
        h('span', { class: 'row-title' + (it.valid ? '' : ' bad'), text: fmt(c.time) + (c.mode === 'beforeEnd' ? ' before end' : ' after start') }),
        h('span', { class: 'row-sub' + (it.valid ? '' : ' bad'), text: sub }));

      if (app.editChimes) {
        container.appendChild(h('div', { class: 'row' },
          h('button', {
            class: 'minus-btn', type: 'button', 'aria-label': 'Delete chime ' + fmt(c.time),
            onclick: function () {
              d.chimes = d.chimes.filter(function (x) { return x.id !== c.id; });
              app.draftChanged();
            }
          }), text));
      } else {
        container.appendChild(h('button', { class: 'row', type: 'button', onclick: function () { openEditor(app, c); } },
          text, h('span', { class: 'chevron' })));
      }
    });

    container.appendChild(h('button', { class: 'row row-add', type: 'button', onclick: function () { openEditor(app, null); } },
      h('span', { class: 'plus' }), h('span', { class: 'row-main', text: 'Add Chime' })));
  }

  /* ---------------- editor sheet ---------------- */
  function openEditor(app, existing) {
    var d = app.draft, isNew = !existing, A = CT.Audio;
    var c = existing ? E.cleanChime(existing) : {
      id: E.newId(),
      mode: 'fromStart',
      // new chime defaults to the middle of the timer (2:00 -> 1:00), like the example
      time: d.totalMs > 0 ? Math.max(1000, Math.round(d.totalMs / 2000) * 1000) : 60000,
      ringSeconds: app.settings.defaultRing,
      sound: d.endSound
    };

    var hint = h('p', { class: 'hint' });
    function updateHint() {
      var total = d.totalMs, at = E.chimeAt(c, total), bad = true, text;
      if (total <= 0) text = 'Set the timer duration first. Until then this chime is skipped.';
      else if (!E.isValidChime(c, total)) text = 'Outside the timer (total ' + fmt(total) + '). This chime will be skipped.';
      else { bad = false; text = 'Rings at ' + fmt(at) + ' elapsed, ' + fmt(total - at) + ' left.'; }
      hint.textContent = text;
      hint.className = 'hint' + (bad ? ' bad' : '');
    }

    var wheels = U.TimeWheels({ onChange: function (ms) { c.time = ms; updateHint(); } });
    wheels.set(c.time);
    var seg = U.Segmented([{ value: 'fromStart', label: 'From start' }, { value: 'beforeEnd', label: 'Before end' }],
      c.mode, function (v) { c.mode = v; updateHint(); });
    var ring = U.Stepper({ min: 1, max: 60, value: c.ringSeconds, format: function (v) { return v + ' s'; },
      onChange: function (v) { c.ringSeconds = v; } });
    var sound = U.SoundSelect(c.sound, 'Sound', function (v) { c.sound = v; });
    var preview = U.PlayButton('Preview sound', function () { A.unlock(); A.ring(sound.get(), 2); });
    updateHint();

    var content = h('div', null,
      wheels.el, seg.el,
      h('div', { class: 'group' }, h('div', { class: 'card' },
        formRow('Ring for', ring.el), formRow('Sound', sound.el, preview))),
      hint,
      isNew ? null : h('div', { class: 'group' }, h('button', {
        class: 'danger-btn', type: 'button', text: 'Delete Chime',
        onclick: function () {
          A.stop(true);
          Sheet.hide();
          d.chimes = d.chimes.filter(function (x) { return x.id !== c.id; });
          app.draftChanged();
        }
      })));

    Sheet.open({
      title: isNew ? 'Add Chime' : 'Edit Chime',
      content: content,
      onOpen: function () { wheels.sync(); requestAnimationFrame(wheels.sync); },
      onDone: function () {
        A.stop(true);
        if (isNew) d.chimes.push(c);
        else d.chimes = d.chimes.map(function (x) { return x.id === c.id ? c : x; });
        app.draftChanged();
      },
      onCancel: function () { A.stop(true); }
    });
  }

  CT.Chimes = { render: render, openEditor: openEditor };
})();
