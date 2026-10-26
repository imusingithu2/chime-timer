/* ui-main.js - main screen: wheels, draft, label / end-ring sheets, Recents, Settings, boot. */
(function () {
  'use strict';
  var CT = (window.CT = window.CT || {});
  var E = window.ChimeEngine, A = CT.Audio, W = CT.Wake, U = CT.ui, h = U.h, Store = CT.Store;
  var Sheet = U.Sheet, R = CT.Running;
  function $(id) { return document.getElementById(id); }

  /* ---------------- settings ---------------- */
  function cleanSettings(raw) {
    raw = raw || {};
    return {
      defaultSound: E.SOUNDS.indexOf(raw.defaultSound) >= 0 ? raw.defaultSound : 'Bell',
      defaultRing: U.clamp(Math.round(Number(raw.defaultRing) || 3), 1, 60),
      defaultEndRing: U.clamp(Math.round(Number(raw.defaultEndRing) || 3), 1, 60),
      keepAwake: raw.keepAwake !== false
    };
  }

  var settings = cleanSettings(Store.get('settings', null));
  var storedDraft = Store.get('draft', null);
  var app = CT.App = {
    settings: settings,
    draft: E.cleanConfig(storedDraft || { totalMs: 0, endSound: settings.defaultSound, endRingSeconds: settings.defaultEndRing }),
    recents: (Store.get('recents', []) || []).slice(0, E.MAX_RECENTS).map(E.cleanConfig),
    editChimes: false,
    editRecents: false,
    draftChanged: draftChanged
  };
  var wheels = null;

  function saveDraft() { Store.set('draft', app.draft); }
  function draftChanged() { saveDraft(); renderIdle(); }

  /* ---------------- idle screen ---------------- */
  function renderIdle() {
    var d = app.draft;
    $('btn-start').disabled = d.totalMs <= 0;
    $('btn-cancel').disabled = d.totalMs <= 0;
    $('val-label').textContent = d.label || 'None';
    $('val-end').textContent = d.endSound + ', ' + (d.endRingSeconds ? d.endRingSeconds + ' s' : 'until stopped');

    if (!d.chimes.length) app.editChimes = false;
    var ec = $('btn-edit-chimes');
    ec.hidden = !d.chimes.length;
    ec.textContent = app.editChimes ? 'Done' : 'Edit';
    CT.Chimes.render($('chimes-list'), app);
    renderRecents();
  }

  function renderRecents() {
    var box = $('recents-list');
    box.innerHTML = '';
    if (!app.recents.length) app.editRecents = false;
    var er = $('btn-edit-recents');
    er.hidden = !app.recents.length;
    er.textContent = app.editRecents ? 'Done' : 'Edit';

    if (!app.recents.length) {
      box.appendChild(h('div', { class: 'row row-empty', text: 'Timers you start appear here.' }));
      return;
    }
    app.recents.forEach(function (r) {
      var sub = [r.label, E.chimeTimesText(r)].filter(Boolean).join(' · ');
      var main = h('span', { class: 'row-main' },
        h('span', { class: 'recent-time', text: E.formatDuration(r.totalMs) }),
        sub ? h('span', { class: 'row-sub', text: sub }) : null);
      if (app.editRecents) {
        box.appendChild(h('div', { class: 'row' },
          h('button', {
            class: 'minus-btn', type: 'button', 'aria-label': 'Delete recent timer',
            onclick: function () {
              var key = E.configKey(r);
              app.recents = app.recents.filter(function (x) { return E.configKey(x) !== key; });
              Store.set('recents', app.recents);
              renderRecents();
            }
          }), main));
      } else {
        box.appendChild(h('div', { class: 'row' },
          h('button', { class: 'row-main hit', type: 'button', 'aria-label': 'Load timer ' + E.formatDuration(r.totalMs), onclick: function () { loadConfig(r); } }, main),
          h('button', {
            class: 'play-btn', type: 'button', 'aria-label': 'Start timer ' + E.formatDuration(r.totalMs),
            onclick: function () { startTimer(E.cloneConfig(r, true)); }
          }, U.icon(U.PLAY))));
      }
    });
  }

  function loadConfig(cfg) {
    app.draft = E.cloneConfig(cfg, true);
    wheels.set(app.draft.totalMs);
    draftChanged();
    $('main-screen').scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- starting a timer (always called from inside a tap) ---------------- */
  function startTimer(cfg, opts) {
    cfg = E.cleanConfig(cfg);
    if (cfg.totalMs <= 0) return;
    A.unlock();                                       // iOS: must happen synchronously in the tap
    var now = Date.now();
    var s = E.start(E.createState(cfg), now);
    if (!(opts && opts.noRecent)) {
      app.recents = E.addRecent(app.recents, cfg, now);
      Store.set('recents', app.recents);
      renderRecents();
    }
    R.opts.keepAwake = settings.keepAwake;
    R.begin(s);
  }

  /* ---------------- sheets ---------------- */
  function formRow(label) {
    var kids = Array.prototype.slice.call(arguments, 1);
    return h('div', { class: 'row' }, h('span', { class: 'row-main', text: label }), kids);
  }

  function editLabel() {
    var input = h('input', {
      class: 'text-input', type: 'text', maxlength: '60', placeholder: 'Label',
      value: app.draft.label, 'aria-label': 'Label', autocapitalize: 'sentences', enterkeyhint: 'done'
    });
    Sheet.open({
      title: 'Label',
      content: h('div', { class: 'group' }, h('div', { class: 'card' }, h('div', { class: 'row' }, input))),
      onDone: function () { app.draft.label = input.value.trim().slice(0, 60); draftChanged(); }
    });
  }

  function editEnd() {
    var d = app.draft;
    var snd = U.SoundSelect(d.endSound, 'End sound');
    var preview = U.PlayButton('Preview sound', function () { A.unlock(); A.ring(snd.get(), 2); });
    var step = U.Stepper({ min: 1, max: 60, value: d.endRingSeconds || settings.defaultEndRing, format: function (v) { return v + ' s'; } });
    var stepRow = formRow('Ring for', step.el);
    var until = U.Switch(d.endRingSeconds === 0, 'Until I stop it', function (on) { stepRow.hidden = on; });
    stepRow.hidden = until.get();
    Sheet.open({
      title: 'When Timer Ends',
      content: h('div', null,
        h('div', { class: 'group' }, h('div', { class: 'card' },
          formRow('Sound', snd.el, preview), formRow('Until I stop it', until.el), stepRow)),
        h('p', { class: 'hint', text: 'The end ring plays when the timer reaches 0:00 and stays on screen until you tap Stop.' })),
      onDone: function () {
        A.stop(true);
        d.endSound = snd.get();
        d.endRingSeconds = until.get() ? 0 : step.get();
        draftChanged();
      },
      onCancel: function () { A.stop(true); }
    });
  }

  function openSettings() {
    var p = { defaultSound: settings.defaultSound, defaultRing: settings.defaultRing, defaultEndRing: settings.defaultEndRing, keepAwake: settings.keepAwake };
    var snd = U.SoundSelect(p.defaultSound, 'Default sound', function (v) { p.defaultSound = v; });
    var ring = U.Stepper({ min: 1, max: 60, value: p.defaultRing, format: function (v) { return v + ' s'; }, onChange: function (v) { p.defaultRing = v; } });
    var endRing = U.Stepper({ min: 1, max: 60, value: p.defaultEndRing, format: function (v) { return v + ' s'; }, onChange: function (v) { p.defaultEndRing = v; } });
    var awake = U.Switch(p.keepAwake, 'Keep screen on while running', function (on) { p.keepAwake = on; });

    function action(label, fn) {
      return h('button', { class: 'row', type: 'button', onclick: fn }, h('span', { class: 'row-main', text: label }));
    }
    var content = h('div', null,
      h('div', { class: 'group' }, h('div', { class: 'card' },
        formRow('Default sound', snd.el),
        formRow('Default chime ring', ring.el),
        formRow('Default end ring', endRing.el))),
      h('div', { class: 'group' }, h('div', { class: 'card' },
        formRow('Keep screen on while running', awake.el),
        action('Test sound', function () { A.unlock(); A.ring(p.defaultSound, 2); }),
        action('Reset audio', function () { A.reset(); U.banner('Audio reset. Tap Test sound to check it.'); }))),
      h('p', { class: 'hint', text: 'Quick demo runs a 20 second timer with a chime at 10 seconds, to check that sound works on this phone.' }),
      h('div', { class: 'group' }, h('div', { class: 'card' },
        action('Quick demo (20 s, chime at 10 s)', function () {
          A.unlock();
          Sheet.hide();
          startTimer({
            totalMs: 20000, label: 'Quick demo', endSound: p.defaultSound, endRingSeconds: 3,
            chimes: [{ id: E.newId(), mode: 'fromStart', time: 10000, ringSeconds: 3, sound: p.defaultSound }]
          }, { noRecent: true });
        }))),
      h('div', { class: 'group' }, h('div', { class: 'card' },
        formRow('Version', h('span', { class: 'row-value', text: 'v' + self.APP_VERSION })))));

    Sheet.open({
      title: 'Settings',
      content: content,
      onDone: function () {
        A.stop(true);
        var soundChanged = p.defaultSound !== settings.defaultSound, endChanged = p.defaultEndRing !== settings.defaultEndRing;
        Object.assign(settings, p);
        Store.set('settings', settings);
        R.opts.keepAwake = settings.keepAwake;
        if (soundChanged) app.draft.endSound = settings.defaultSound;
        if (endChanged) app.draft.endRingSeconds = settings.defaultEndRing;
        draftChanged();
      },
      onCancel: function () { A.stop(true); }
    });
  }

  /* ---------------- service worker + update banner ---------------- */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) U.banner('Updated - tap to reload', { sticky: true, onTap: function () { location.reload(); } });
    });
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () { /* e.g. plain http: no offline mode */ });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update().catch(function () {}); }).catch(function () {});
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    R.init();
    R.opts.keepAwake = settings.keepAwake;
    R.onExit = renderIdle;
    A.onBlocked = function () { U.soundBanner('Sound blocked - tap anywhere to enable'); };
    A.load();

    wheels = U.TimeWheels({
      onChange: function (ms) { app.draft.totalMs = ms; saveDraft(); renderIdle(); }
    });
    $('wheels').appendChild(wheels.el);
    wheels.set(app.draft.totalMs);

    $('btn-start').addEventListener('click', function () { startTimer(app.draft); });
    $('btn-cancel').addEventListener('click', function () { wheels.set(0); app.draft.totalMs = 0; draftChanged(); });
    $('row-label').addEventListener('click', editLabel);
    $('row-end').addEventListener('click', editEnd);
    $('row-settings').addEventListener('click', openSettings);
    $('btn-edit-chimes').addEventListener('click', function () { app.editChimes = !app.editChimes; renderIdle(); });
    $('btn-edit-recents').addEventListener('click', function () { app.editRecents = !app.editRecents; renderRecents(); });
    $('footnote').textContent = 'Chime Timer v' + self.APP_VERSION;

    renderIdle();
    wheels.sync();

    var saved = E.restoreState(Store.get('run', null));
    if (saved) R.restore(saved);
    else Store.del('run');

    registerServiceWorker();
  }

  try { boot(); } catch (e) { CT.showError('App failed to start: ' + (e && e.message ? e.message : e)); throw e; }
})();
