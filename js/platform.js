/* platform.js - browser services: safe storage, audio, screen wake lock.
   Classic script (no modules).  Everything lives under window.CT. */
(function () {
  'use strict';
  var CT = (window.CT = window.CT || {});

  /* ---------------- Error banner: show errors on the phone itself ---------------- */
  var errTimer = null;
  CT.showError = function (msg) {
    var el = document.getElementById('error-banner');
    if (!el) return;
    el.textContent = String(msg).slice(0, 300);
    el.hidden = false;
    el.onclick = function () { el.hidden = true; };
    clearTimeout(errTimer);
    errTimer = setTimeout(function () { el.hidden = true; }, 8000);
  };
  window.addEventListener('error', function (ev) {
    var t = ev.target;
    if (t && t !== window && t.tagName) {                    // a <script>/<link> that failed to load
      CT.showError('Failed to load ' + (t.src || t.href || t.tagName));
    } else {
      CT.showError((ev.message || 'Error') + (ev.filename ? ' (' + ev.filename.split('/').pop() + ':' + ev.lineno + ')' : ''));
    }
  }, true);
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    CT.showError('Error: ' + ((r && r.message) || r));
  });

  /* ---------------- Storage: every access wrapped in try/catch ---------------- */
  var PREFIX = 'chimetimer.';
  CT.Store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    del: function (key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    }
  };

  /* ---------------- Audio ----------------
     Design notes (iPhone):
     - ONE <audio> element is created once and reused for every sound. iOS only allows
       programmatic play() on an element that was started inside a user tap; a freshly created
       Audio() object (or a cloneNode) is NOT unlocked and stays silent. Changing .src on the
       unlocked element keeps it unlocked.
     - Unlocking = playing silent.wav (not muted, inaudible) from inside a tap handler.
       unlock() must therefore be called synchronously from tap handlers (Start, Resume, ...).
     - No AudioContext: on iOS 26 it can go permanently silent in Home Screen web apps.
     - Sounds are fetched once and played from blob: URLs, so playback never depends on
       the service worker answering Range requests. (sw.js also handles Range as a fallback.)
     - Every sound is exactly 1.000 s and fades to silence at both ends, so "ring for N seconds"
       is N seamless loops; we stop 60 ms before the Nth loop boundary, where it is silent. */
  var NAMES = ['Bell', 'Chime', 'Marimba', 'Beacon', 'Pulse', 'Digital', 'silent'];
  var Audio_ = {
    el: null, urls: {}, unlocked: false, blocked: false, cur: null, stopTimer: null, onBlocked: null
  };
  CT.Audio = Audio_;

  function urlFor(name) { return Audio_.urls[name] || './sounds/' + name + '.wav'; }

  function create() {
    var el = new window.Audio();
    el.preload = 'auto';
    el.loop = false;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.src = urlFor('silent');
    Audio_.el = el;
    return el;
  }

  Audio_.load = function () {
    if (!window.fetch || !window.URL || !URL.createObjectURL) return;
    NAMES.forEach(function (name) {
      fetch('./sounds/' + name + '.wav').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      }).then(function (blob) {
        Audio_.urls[name] = URL.createObjectURL(blob);
      }).catch(function () { /* the plain URL is used as a fallback */ });
    });
  };

  function startCurrent() {
    var cur = Audio_.cur, el = Audio_.el;
    if (!cur || !el) return;
    el.muted = false;
    el.loop = true;
    el.src = urlFor(cur.name);
    var p = el.play();
    if (p && p.catch) {
      p.catch(function (err) {
        if (!Audio_.cur || Audio_.cur !== cur) return;          // replaced or stopped meanwhile
        if (err && err.name === 'AbortError') return;
        Audio_.blocked = true;
        if (Audio_.onBlocked) Audio_.onBlocked();
      });
    }
  }

  /* Call from inside a tap/click handler, synchronously (no await before it). */
  Audio_.unlock = function () {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    var el = Audio_.el || create();
    if (Audio_.cur && !el.paused) { Audio_.unlocked = true; return; } // already ringing -> it IS unlocked
    el.loop = false;
    el.muted = false;
    el.src = urlFor('silent');
    var p = el.play();
    var done = function () {
      Audio_.unlocked = true;
      if (!Audio_.cur) { try { el.pause(); el.currentTime = 0; } catch (e) { /* ignore */ } }
      if (Audio_.blocked && Audio_.cur && Date.now() < Audio_.cur.endAt) {   // retry a ring that was blocked
        Audio_.blocked = false;
        startCurrent();
      } else {
        Audio_.blocked = false;
      }
    };
    if (p && p.then) p.then(done, function () { /* still locked: the next tap tries again */ });
    else done();
  };

  /* Ring a sound for `seconds` (0 = until stop()). */
  Audio_.ring = function (name, seconds, onEnd) {
    if (!Audio_.el) create();
    Audio_.stop(true);
    var cur = { name: name, endAt: seconds > 0 ? Date.now() + seconds * 1000 : Infinity, onEnd: onEnd };
    Audio_.cur = cur;
    startCurrent();
    if (seconds > 0) {
      Audio_.stopTimer = setTimeout(function () {
        if (Audio_.cur === cur) Audio_.stop();
      }, Math.max(100, seconds * 1000 - 60));
    }
  };

  Audio_.stop = function (silently) {
    clearTimeout(Audio_.stopTimer);
    Audio_.stopTimer = null;
    var cur = Audio_.cur;
    Audio_.cur = null;
    Audio_.blocked = false;
    var el = Audio_.el;
    if (el) { try { el.pause(); el.currentTime = 0; } catch (e) { /* ignore */ } }
    if (cur && cur.onEnd && !silently) { try { cur.onEnd(); } catch (e) { /* ignore */ } }
  };

  Audio_.isRinging = function () { return !!Audio_.cur; };

  /* "Reset audio": throw the element away and unlock a brand new one (call from a tap). */
  Audio_.reset = function () {
    Audio_.stop(true);
    if (Audio_.el) { try { Audio_.el.removeAttribute('src'); Audio_.el.load(); } catch (e) { /* ignore */ } }
    Audio_.el = null;
    Audio_.unlocked = false;
    Audio_.blocked = false;
    create();
    Audio_.unlock();
  };

  /* iOS only treats real taps as user activation: unlock on the first one, and again whenever
     a ring was blocked. (We do not play silence on every tap: it would duck other apps' audio.) */
  function onGesture() {
    if (!Audio_.unlocked || Audio_.blocked) Audio_.unlock();
  }
  ['touchend', 'click', 'keydown'].forEach(function (type) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  });

  /* ---------------- Screen Wake Lock ---------------- */
  var lock = null, want = false, pending = false, denied = false;
  var Wake = {
    supported: 'wakeLock' in navigator,
    onChange: null,
    active: function () { return !!lock; },
    denied: function () { return denied; }
  };
  CT.Wake = Wake;

  function notify() { if (Wake.onChange) Wake.onChange(); }

  function acquire() {
    if (!Wake.supported || lock || pending || document.visibilityState !== 'visible') return;
    pending = true;
    navigator.wakeLock.request('screen').then(function (l) {
      pending = false;
      if (!want) { l.release().catch(function () {}); return; }   // released while we were asking
      lock = l;
      denied = false;
      l.addEventListener('release', function () { if (lock === l) { lock = null; notify(); } });
      notify();
    }).catch(function () {                                          // e.g. Low Power Mode
      pending = false;
      lock = null;
      denied = true;
      notify();
    });
  }

  /* Ask for the lock (call from the Start/Resume tap). */
  Wake.request = function () { want = true; if (!Wake.supported) { notify(); return; } acquire(); };
  Wake.release = function () {
    want = false;
    if (lock) { var l = lock; lock = null; l.release().catch(function () {}); }
    notify();
  };
  /* iOS drops the lock whenever the app is hidden: take it again when we are visible. */
  Wake.reacquire = function () { if (want) acquire(); };
  Wake.wanted = function () { return want; };
})();
