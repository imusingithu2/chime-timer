/* engine.js - pure timer logic, no DOM.
   Browser: window.ChimeEngine.  Node (tests): require('./js/engine.js').
   All timing is based on wall-clock timestamps (Date.now() values passed in as `now`),
   never on counting ticks, so state survives reloads and iOS freezing the page. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChimeEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_MS = ((23 * 60 + 59) * 60 + 59) * 1000; // 23:59:59
  var LATE_MS = 2000;                               // an event up to 2 s late still rings
  var MAX_RECENTS = 20;
  var SOUNDS = ['Bell', 'Chime', 'Marimba', 'Beacon', 'Pulse', 'Digital'];

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function num(n, def) { n = Number(n); return isFinite(n) ? n : def; }
  function numOrNull(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
  function whole(ms) { return Math.round(ms / 1000) * 1000; }
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- cleaning / validation of anything that comes from storage ---------- */

  function cleanChime(c) {
    c = c || {};
    return {
      id: typeof c.id === 'string' && c.id ? c.id : newId(),
      mode: c.mode === 'beforeEnd' ? 'beforeEnd' : 'fromStart',
      time: clamp(whole(num(c.time, 0)), 0, MAX_MS),
      ringSeconds: clamp(Math.round(num(c.ringSeconds, 3)), 1, 60),
      sound: SOUNDS.indexOf(c.sound) >= 0 ? c.sound : 'Bell'
    };
  }

  function cleanConfig(raw) {
    raw = raw || {};
    return {
      totalMs: clamp(whole(num(raw.totalMs, 0)), 0, MAX_MS),
      label: typeof raw.label === 'string' ? raw.label.slice(0, 60) : '',
      chimes: Array.isArray(raw.chimes) ? raw.chimes.slice(0, 50).map(cleanChime) : [],
      endSound: SOUNDS.indexOf(raw.endSound) >= 0 ? raw.endSound : 'Bell',
      endRingSeconds: clamp(Math.round(num(raw.endRingSeconds, 3)), 0, 60) // 0 = until I stop it
    };
  }

  function cloneConfig(cfg, freshIds) {
    var c = cleanConfig(cfg);
    if (freshIds) c.chimes.forEach(function (x) { x.id = newId(); });
    return c;
  }

  /* ---------- chimes ---------- */

  function chimeAt(c, totalMs) { return c.mode === 'beforeEnd' ? totalMs - c.time : c.time; }

  /* A chime must fall strictly inside the timer: 0 < at < total. */
  function isValidChime(c, totalMs) {
    var at = chimeAt(c, totalMs);
    return totalMs > 0 && at > 0 && at < totalMs;
  }

  /* Valid chimes sorted by time (chimes at the same instant are merged into one ring using
     the longer ring), followed by the invalid ones in their original order. */
  function resolveChimes(chimes, totalMs) {
    var valid = [], invalid = [], byAt = {};
    (chimes || []).forEach(function (c) {
      var item = {
        id: c.id, ids: [c.id], atElapsedMs: chimeAt(c, totalMs), ringSeconds: c.ringSeconds,
        sound: c.sound, mode: c.mode, time: c.time, valid: isValidChime(c, totalMs), merged: false
      };
      if (!item.valid) { invalid.push(item); return; }
      var first = byAt[item.atElapsedMs];
      if (first) {
        first.ids.push(c.id);
        first.merged = true;
        if (c.ringSeconds > first.ringSeconds) { first.ringSeconds = c.ringSeconds; first.sound = c.sound; }
      } else {
        byAt[item.atElapsedMs] = item;
        valid.push(item);
      }
    });
    valid.sort(function (a, b) { return a.atElapsedMs - b.atElapsedMs; });
    return valid.concat(invalid);
  }

  /* ---------- timer state ---------- */

  function createState(cfg) {
    var c = cleanConfig(cfg);
    return {
      status: 'idle', totalMs: c.totalMs, accumulatedMs: 0, lastResumeAt: null,
      chimes: c.chimes, endSound: c.endSound, endRingSeconds: c.endRingSeconds, label: c.label,
      firedChimeIds: [], missedIds: [], startedAt: null, endedAt: null, endedSilently: false
    };
  }

  /* Rebuild a state saved in localStorage. Returns null when it is unusable. */
  function restoreState(raw) {
    if (!raw || ['running', 'paused', 'ended'].indexOf(raw.status) < 0) return null;
    var s = createState(raw);
    if (s.totalMs <= 0) return null;
    var ids = function (a) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; };
    s.status = raw.status;
    s.accumulatedMs = clamp(num(raw.accumulatedMs, 0), 0, s.totalMs);
    s.lastResumeAt = raw.status === 'running' ? numOrNull(raw.lastResumeAt) : null;
    if (raw.status === 'running' && s.lastResumeAt == null) return null;
    s.firedChimeIds = ids(raw.firedChimeIds);
    s.missedIds = ids(raw.missedIds);
    s.startedAt = numOrNull(raw.startedAt);
    s.endedAt = numOrNull(raw.endedAt);
    s.endedSilently = !!raw.endedSilently;
    if (s.status === 'ended') { s.accumulatedMs = s.totalMs; if (s.endedAt == null) s.endedAt = Date.now(); }
    return s;
  }

  function rawElapsedMs(s, now) {
    var e = s.accumulatedMs || 0;
    if (s.status === 'running' && s.lastResumeAt != null) e += Math.max(0, now - s.lastResumeAt);
    return e;
  }
  function elapsedMs(s, now) {
    return s.status === 'ended' ? s.totalMs : clamp(rawElapsedMs(s, now), 0, s.totalMs);
  }
  function remainingMs(s, now) { return s.totalMs - elapsedMs(s, now); }

  function start(s, now) {
    s.status = 'running'; s.accumulatedMs = 0; s.lastResumeAt = now; s.startedAt = now;
    s.endedAt = null; s.endedSilently = false; s.firedChimeIds = []; s.missedIds = [];
    return s;
  }
  function pause(s, now) {
    if (s.status === 'running') {
      s.accumulatedMs = clamp(rawElapsedMs(s, now), 0, s.totalMs);
      s.lastResumeAt = null; s.status = 'paused';
    }
    return s;
  }
  function resume(s, now) {
    if (s.status === 'paused') { s.lastResumeAt = now; s.status = 'running'; }
    return s;
  }

  /* What is due right now?  Catch-up rule: an event at most 2 s late still rings; a later one
     is only marked as fired + missed (never rung late).  If the whole timer ended while the
     page was frozen, end === 'silent' (show "Ended at HH:MM", play nothing). */
  function dueEvents(s, now) {
    var res = { ring: [], missed: [], fired: [], end: null, endedAt: null };
    if (s.status !== 'running') return res;
    var raw = rawElapsedMs(s, now);
    var ended = raw >= s.totalMs;
    var fired = s.firedChimeIds || [];
    resolveChimes(s.chimes, s.totalMs).forEach(function (c) {
      if (!c.valid || raw < c.atElapsedMs) return;
      if (c.ids.every(function (id) { return fired.indexOf(id) >= 0; })) return;
      Array.prototype.push.apply(res.fired, c.ids);
      if (raw - c.atElapsedMs > LATE_MS) Array.prototype.push.apply(res.missed, c.ids);
      else if (!ended) res.ring.push(c); // when the timer ends, the end ring takes over
    });
    if (ended) {
      res.end = raw - s.totalMs <= LATE_MS ? 'ring' : 'silent';
      res.endedAt = now - (raw - s.totalMs);
    }
    return res;
  }

  function applyDue(s, due) {
    due.fired.forEach(function (id) { if (s.firedChimeIds.indexOf(id) < 0) s.firedChimeIds.push(id); });
    due.missed.forEach(function (id) { if (s.missedIds.indexOf(id) < 0) s.missedIds.push(id); });
    if (due.end) {
      s.status = 'ended'; s.accumulatedMs = s.totalMs; s.lastResumeAt = null;
      s.endedAt = due.endedAt; s.endedSilently = due.end === 'silent';
    }
    return s;
  }

  /* 'rang' | 'missed' | 'upcoming' for a resolved chime */
  function chimeState(s, c) {
    if (c.ids.some(function (id) { return s.missedIds.indexOf(id) >= 0; })) return 'missed';
    if (c.ids.every(function (id) { return s.firedChimeIds.indexOf(id) >= 0; })) return 'rang';
    return 'upcoming';
  }

  function nextChime(s, now) {
    var el = elapsedMs(s, now), found = null;
    resolveChimes(s.chimes, s.totalMs).some(function (c) {
      if (c.valid && c.atElapsedMs > el && chimeState(s, c) === 'upcoming') { found = c; return true; }
      return false;
    });
    return found ? { chime: found, inMs: found.atElapsedMs - el } : null;
  }

  /* ---------- text helpers ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* 'ceil' for a countdown (shows 2:00 until the first second has passed), else floor. */
  function formatDuration(ms, round) {
    var s = Math.max(0, round === 'ceil' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? h + ':' + pad2(m) + ':' + pad2(sec) : m + ':' + pad2(sec);
  }

  function chimeSummary(c) {
    return formatDuration(c.time) + (c.mode === 'beforeEnd' ? ' before end' : ' after start') +
      ' · ' + c.ringSeconds + ' s · ' + c.sound;
  }

  /* "rings at 1:00, 1:30 +1" for recents */
  function chimeTimesText(cfg) {
    var times = resolveChimes(cfg.chimes, cfg.totalMs).filter(function (c) { return c.valid; })
      .map(function (c) { return formatDuration(c.atElapsedMs); });
    if (!times.length) return '';
    var shown = times.slice(0, 3).join(', ');
    return 'rings at ' + shown + (times.length > 3 ? ' +' + (times.length - 3) : '');
  }

  /* ---------- recents ---------- */

  function configKey(cfg) {
    var c = cleanConfig(cfg);
    return JSON.stringify([c.totalMs, c.label, c.endSound, c.endRingSeconds,
      c.chimes.map(function (x) { return [x.mode, x.time, x.ringSeconds, x.sound]; })]);
  }

  /* newest first, no exact duplicates, max 20 */
  function addRecent(list, cfg, now) {
    var c = cleanConfig(cfg); c.at = now;
    var key = configKey(c);
    var rest = (list || []).filter(function (r) { return configKey(r) !== key; });
    return [c].concat(rest).slice(0, MAX_RECENTS);
  }

  return {
    MAX_MS: MAX_MS, LATE_MS: LATE_MS, MAX_RECENTS: MAX_RECENTS, SOUNDS: SOUNDS,
    newId: newId, cleanChime: cleanChime, cleanConfig: cleanConfig, cloneConfig: cloneConfig,
    chimeAt: chimeAt, isValidChime: isValidChime, resolveChimes: resolveChimes,
    createState: createState, restoreState: restoreState, rawElapsedMs: rawElapsedMs, elapsedMs: elapsedMs, remainingMs: remainingMs,
    start: start, pause: pause, resume: resume, dueEvents: dueEvents, applyDue: applyDue,
    chimeState: chimeState, nextChime: nextChime,
    formatDuration: formatDuration, chimeSummary: chimeSummary, chimeTimesText: chimeTimesText,
    configKey: configKey, addRecent: addRecent
  };
});
