/* ui-widgets.js - small reusable UI pieces: DOM helper, time wheels, bottom sheet,
   segmented control, stepper, switch, banner.  Classic script, exports window.CT.ui. */
(function () {
  'use strict';
  var CT = (window.CT = window.CT || {});
  var E = window.ChimeEngine;
  var NS = 'http://www.w3.org/2000/svg';
  var ITEM = 44;                                   // row height of a wheel, px (must match picker.css)

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  /* h('div', {class:'x', onclick: fn}, child, 'text', [more children]) */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }

  function icon(pathData) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', pathData);
    s.appendChild(p);
    return s;
  }
  var PLAY = 'M8 5v14l11-7z';

  function clock(ts) {
    try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  /* ---------------- one wheel ---------------- */
  function makeWheel(max, label, onChange) {
    var value = 0, timer = null;
    var el = h('div', {
      class: 'wheel', tabindex: '0', role: 'spinbutton', 'aria-label': label,
      'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': 0
    });
    el.appendChild(h('div', { class: 'wheel-spacer' }));
    for (var i = 0; i <= max; i++) {
      el.appendChild(h('div', {
        class: 'wheel-item', text: String(i),
        onclick: (function (n) { return function () { el.scrollTo({ top: n * ITEM, behavior: 'smooth' }); }; })(i)
      }));
    }
    el.appendChild(h('div', { class: 'wheel-spacer' }));

    function read() { return clamp(Math.round(el.scrollTop / ITEM), 0, max); }
    function commit() {
      var v = read();
      if (v !== value) { value = v; el.setAttribute('aria-valuenow', v); onChange(v); }
    }
    el.addEventListener('scroll', function () { clearTimeout(timer); timer = setTimeout(commit, 90); });
    if ('onscrollend' in window) el.addEventListener('scrollend', commit);
    el.addEventListener('keydown', function (ev) {
      var d = ev.key === 'ArrowUp' ? -1 : ev.key === 'ArrowDown' ? 1 : 0;
      if (!d) return;
      ev.preventDefault();
      api.set(clamp(value + d, 0, max));
      el.setAttribute('aria-valuenow', value);
      onChange(value);
    });

    var api = {
      el: el,
      get: function () { return value; },
      set: function (v) { value = clamp(v, 0, max); el.scrollTop = value * ITEM; },
      sync: function () { el.scrollTop = value * ITEM; }       // call after the wheel became visible
    };
    return api;
  }

  /* ---------------- hours / min / sec wheels ---------------- */
  function TimeWheels(opts) {
    opts = opts || {};
    function changed() { if (opts.onChange) opts.onChange(get()); }
    var wh = makeWheel(23, 'Hours', changed), wm = makeWheel(59, 'Minutes', changed), ws = makeWheel(59, 'Seconds', changed);
    function get() { return (wh.get() * 3600 + wm.get() * 60 + ws.get()) * 1000; }
    function set(ms) {
      var s = clamp(Math.round(ms / 1000), 0, 86399);
      wh.set(Math.floor(s / 3600)); wm.set(Math.floor((s % 3600) / 60)); ws.set(s % 60);
    }
    function col(w, unit) { return h('div', { class: 'wheel-col' }, w.el, h('div', { class: 'wheel-unit', text: unit })); }
    var el = h('div', { class: 'wheels' }, h('div', { class: 'wheel-band' }),
      h('div', { class: 'wheel-cols' }, col(wh, 'hours'), col(wm, 'min'), col(ws, 'sec')));
    return {
      el: el, get: get, set: set,
      sync: function () { wh.sync(); wm.sync(); ws.sync(); },
      wheels: { h: wh, m: wm, s: ws }
    };
  }

  /* ---------------- bottom sheet ---------------- */
  var sheetOpts = null;
  function $(id) { return document.getElementById(id); }
  var Sheet = {
    isOpen: function () { return !!sheetOpts; },
    /* o: {title, content:Node, doneText, cancelText (null hides it), onDone (return false to stay), onCancel, onOpen} */
    open: function (o) {
      sheetOpts = o;
      $('sheet-title').textContent = o.title || '';
      var c = $('sheet-content');
      c.innerHTML = '';
      c.appendChild(o.content);
      $('sheet-done').textContent = o.doneText || 'Done';
      $('sheet-cancel').textContent = o.cancelText || 'Cancel';
      $('sheet-cancel').classList.toggle('invisible', o.cancelText === null);
      $('sheet-backdrop').classList.add('show');
      $('sheet').classList.add('open');
      c.scrollTop = 0;
      if (o.onOpen) o.onOpen();
    },
    hide: function () {
      var o = sheetOpts;
      sheetOpts = null;
      $('sheet').classList.remove('open');
      $('sheet-backdrop').classList.remove('show');
      return o;
    },
    done: function () {
      if (!sheetOpts) return;
      var r = sheetOpts.onDone ? sheetOpts.onDone() : undefined;
      if (r !== false) Sheet.hide();
    },
    cancel: function () {
      if (!sheetOpts) return;
      var o = Sheet.hide();
      if (o.onCancel) o.onCancel();
    }
  };
  $('sheet-done').addEventListener('click', Sheet.done);
  $('sheet-cancel').addEventListener('click', Sheet.cancel);
  $('sheet-backdrop').addEventListener('click', Sheet.cancel);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') Sheet.cancel(); });

  /* ---------------- small controls ---------------- */
  function Segmented(options, value, onChange) {
    var btns = options.map(function (o) {
      return h('button', { type: 'button', text: o.label, onclick: function () { set(o.value); onChange(o.value); } });
    });
    function set(v) {
      value = v;
      btns.forEach(function (b, i) { b.setAttribute('aria-pressed', String(options[i].value === v)); });
    }
    set(value);
    return { el: h('div', { class: 'segmented' }, btns), get: function () { return value; }, set: set };
  }

  function Stepper(o) {                            // {min, max, value, format, onChange}
    var value = o.value;
    var val = h('span', { class: 'stepper-val' });
    function paint() { val.textContent = o.format ? o.format(value) : String(value); }
    function bump(d) { value = clamp(value + d, o.min, o.max); paint(); if (o.onChange) o.onChange(value); }
    paint();
    return {
      el: h('span', { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': 'Decrease', text: '−', onclick: function () { bump(-1); } }), val,
        h('button', { type: 'button', 'aria-label': 'Increase', text: '+', onclick: function () { bump(1); } })),
      get: function () { return value; },
      set: function (v) { value = clamp(v, o.min, o.max); paint(); }
    };
  }

  function Switch(on, label, onChange) {
    var el = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': String(!!on) });
    el.addEventListener('click', function () {
      on = !on;
      el.setAttribute('aria-checked', String(on));
      if (onChange) onChange(on);
    });
    return { el: el, get: function () { return on; } };
  }

  function SoundSelect(value, label, onChange) {
    var sel = h('select', { class: 'select', 'aria-label': label },
      E.SOUNDS.map(function (n) { return h('option', { value: n, text: n }); }));
    sel.value = value;
    sel.addEventListener('change', function () { if (onChange) onChange(sel.value); });
    return { el: sel, get: function () { return sel.value; } };
  }

  function PlayButton(label, onClick) {
    return h('button', { class: 'play-btn small', type: 'button', 'aria-label': label, onclick: onClick }, icon(PLAY));
  }

  /* ---------------- banner ---------------- */
  var bannerTimer = null;
  function hideBanner() { $('banner').hidden = true; }
  function banner(text, o) {
    o = o || {};
    var el = $('banner');
    el.textContent = text;
    el.hidden = false;
    el.style.cursor = 'pointer';
    el.onclick = function () { hideBanner(); if (o.onTap) o.onTap(); };
    clearTimeout(bannerTimer);
    if (!o.sticky) bannerTimer = setTimeout(hideBanner, o.ms || 4000);
  }

  /* A sticky banner about audio that hides itself once audio is unlocked again. */
  function soundBanner(text) {
    banner(text, { sticky: true });
    var n = 0, t = setInterval(function () {
      var A = CT.Audio;
      if ((A.unlocked && !A.blocked) || ++n > 1200) {
        clearInterval(t);
        if ($('banner').textContent === text) hideBanner();
      }
    }, 250);
  }

  CT.ui = {
    h: h, icon: icon, PLAY: PLAY, clock: clock, clamp: clamp,
    TimeWheels: TimeWheels, Sheet: Sheet, Segmented: Segmented, Stepper: Stepper, Switch: Switch,
    SoundSelect: SoundSelect, PlayButton: PlayButton, banner: banner, hideBanner: hideBanner, soundBanner: soundBanner
  };
})();
