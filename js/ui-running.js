/* ui-running.js - the running / paused / ended screen.
   It only READS the clock every 100 ms and asks the engine what is due (never counts ticks). */
(function () {
  'use strict';
  var CT = (window.CT = window.CT || {});
  var E = window.ChimeEngine, A = CT.Audio, W = CT.Wake, U = CT.ui, h = U.h, Store = CT.Store;
  var NS = 'http://www.w3.org/2000/svg';
  var CIRC = 2 * Math.PI * 140;
  function $(id) { return document.getElementById(id); }

  var R = CT.Running = { state: null, onExit: null, opts: { keepAwake: true } };
  var el = {}, timer = null, listSig = '', nextSig = '', bannerTimer = null;

  function persist() { if (R.state) Store.set('run', R.state); }
  function fmt(ms) { return E.formatDuration(ms); }

  /* ---------------- chime banner (shown while a chime rings) ---------------- */
  function hideChimeBanner() { clearTimeout(bannerTimer); el.banner.hidden = true; }
  function ringChime(c) {
    A.ring(c.sound, c.ringSeconds, hideChimeBanner);
    el.bannerText.textContent = 'Chime · ' + fmt(c.atElapsedMs);
    el.banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(hideChimeBanner, c.ringSeconds * 1000 + 1500);
  }

  /* ---------------- ticking ---------------- */
  function startTick() { stopTick(); timer = setInterval(tick, 100); }
  function stopTick() { if (timer) { clearInterval(timer); timer = null; } }

  function tick() {
    var s = R.state;
    if (!s) return;
    var now = Date.now();
    if (s.status === 'running') {
      var due = E.dueEvents(s, now);
      if (due.fired.length || due.end) {
        E.applyDue(s, due);
        persist();
        if (due.ring.length) ringChime(due.ring[due.ring.length - 1]);   // most recent one if several are due
        if (due.end) onEnded(due);
      }
    }
    render(now);
  }

  function onEnded(due) {
    stopTick();
    hideChimeBanner();
    W.release();
    if (due.end === 'ring') A.ring(R.state.endSound, R.state.endRingSeconds);   // 0 = until I stop it
  }

  /* ---------------- rendering ---------------- */
  function renderWake() {
    if (!R.state) return;
    el.lock.hidden = !W.active();
    var live = R.state.status === 'running' || R.state.status === 'paused';
    el.tip.hidden = !(live && (!W.supported || W.denied() || !R.opts.keepAwake));
  }

  function renderTicks(resolved, s) {
    el.ticks.innerHTML = '';
    resolved.forEach(function (c) {
      if (!c.valid) return;
      var a = (c.atElapsedMs / s.totalMs) * 2 * Math.PI, st = E.chimeState(s, c);
      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', (150 + Math.sin(a) * 129).toFixed(2));
      line.setAttribute('y1', (150 - Math.cos(a) * 129).toFixed(2));
      line.setAttribute('x2', (150 + Math.sin(a) * 148).toFixed(2));
      line.setAttribute('y2', (150 - Math.cos(a) * 148).toFixed(2));
      line.setAttribute('class', 'ring-tick' + (st === 'upcoming' ? '' : ' ' + st));
      el.ticks.appendChild(line);
    });
  }

  function renderChimes(s, now) {
    var rc = E.resolveChimes(s.chimes, s.totalMs);
    if (!rc.length) { el.list.hidden = true; listSig = ''; return; }
    var elapsed = E.elapsedMs(s, now), nextC = E.nextChime(s, now);
    var parts = rc.map(function (c) {
      var st = c.valid ? E.chimeState(s, c) : 'invalid', txt, cls;
      if (st === 'invalid') { txt = 'Outside timer'; cls = 'bad'; }
      else if (st === 'rang') { txt = 'Rang'; cls = 'rang'; }
      else if (st === 'missed') { txt = 'Missed'; cls = 'missed'; }
      else { txt = 'in ' + E.formatDuration(c.atElapsedMs - elapsed, 'ceil'); cls = nextC && nextC.chime === c ? 'next' : ''; }
      return { c: c, st: st, txt: txt, cls: cls };
    });
    var sig = parts.map(function (p) { return p.c.id + p.txt + p.cls; }).join('|');
    if (sig === listSig) return;
    listSig = sig;
    el.list.innerHTML = '';
    el.list.hidden = false;
    parts.forEach(function (p) {
      el.list.appendChild(h('div', { class: 'row' },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title', text: fmt(p.c.atElapsedMs) }),
          h('span', { class: 'row-sub', text: p.c.sound + ' · ' + p.c.ringSeconds + ' s' })),
        h('span', { class: 'st ' + p.cls, text: p.txt })));
    });
    renderTicks(rc, s);
  }

  function render(now) {
    var s = R.state;
    if (!s) return;
    var ended = s.status === 'ended', paused = s.status === 'paused';
    el.screen.classList.toggle('paused', paused);
    el.screen.classList.toggle('ended', ended);

    var txt = E.formatDuration(E.remainingMs(s, now), 'ceil');
    if (el.time.textContent !== txt) {
      el.time.textContent = txt;
      el.time.classList.toggle('long', txt.length > 5);
    }
    var frac = s.totalMs ? Math.min(1, E.elapsedMs(s, now) / s.totalMs) : 1;
    el.ring.setAttribute('stroke-dashoffset', (CIRC * frac).toFixed(2));

    el.title.textContent = ended ? 'Timer Ended' : s.label;
    el.title.classList.toggle('ended', ended);
    var endText;
    if (ended) endText = (s.label ? s.label + ' · ' : '') + 'Ended at ' + U.clock(s.endedAt || now);
    else if (paused) endText = 'Paused';
    else endText = U.clock(now + E.remainingMs(s, now));
    if (el.endText.textContent !== endText) el.endText.textContent = endText;

    var mode = ended ? 'stop' : paused ? 'resume' : 'pause';
    if (el.pause.dataset.mode !== mode) {
      el.pause.dataset.mode = mode;
      el.pause.className = 'circle-btn ' + mode;
      el.pause.textContent = mode === 'stop' ? 'Stop' : mode === 'resume' ? 'Resume' : 'Pause';
    }

    renderChimes(s, now);

    var nxt = ended ? null : E.nextChime(s, now);
    var nextKey = ended ? 'x' : nxt ? 'in ' + E.formatDuration(nxt.inMs, 'ceil') : 'none';
    if (nextKey !== nextSig) {
      nextSig = nextKey;
      el.next.innerHTML = '';
      if (!ended) {
        if (nxt) el.next.append('Next chime in ', h('b', { text: E.formatDuration(nxt.inMs, 'ceil') }));
        else el.next.textContent = 'No more chimes';
      }
    }
    renderWake();
  }

  /* ---------------- user actions ---------------- */
  function showScreen() {
    listSig = ''; nextSig = '';
    el.screen.hidden = false;
    el.screen.scrollTop = 0;
    var main = $('main-screen');
    main.inert = true;
    main.setAttribute('aria-hidden', 'true');
  }

  function finish() {
    stopTick();
    A.stop(true);
    hideChimeBanner();
    W.release();
    R.state = null;
    Store.del('run');
    el.screen.hidden = true;
    var main = $('main-screen');
    main.inert = false;
    main.removeAttribute('aria-hidden');
    if (R.onExit) R.onExit();
  }

  function pauseResume() {
    var s = R.state, now = Date.now();
    if (!s) return;
    if (s.status === 'ended') { finish(); return; }
    if (s.status === 'running') {
      E.pause(s, now);
      A.stop(true);                      // pausing silences a ring that is playing
      hideChimeBanner();
      W.release();
      stopTick();
    } else if (s.status === 'paused') {
      A.unlock();                        // inside the tap
      E.resume(s, now);
      if (R.opts.keepAwake) W.request();
      startTick();
    }
    persist();
    tick();
  }

  /* A brand new timer (call from the Start tap). */
  R.begin = function (state) {
    R.state = state;
    persist();
    showScreen();
    if (R.opts.keepAwake) W.request();
    startTick();
    tick();
  };

  /* A timer that was running when the page was closed or reloaded. */
  R.restore = function (state) {
    R.state = state;
    showScreen();
    if (state.status === 'running') {
      if (R.opts.keepAwake) W.request();
      startTick();
      if (!A.unlocked) U.soundBanner('Tap anywhere to enable sound');
    }
    tick();
  };

  R.init = function () {
    el.screen = $('running-screen'); el.title = $('run-title'); el.time = $('run-time');
    el.endText = $('run-end-text'); el.ring = $('ring-progress'); el.ticks = $('ring-ticks');
    el.cancel = $('run-cancel'); el.pause = $('run-pause'); el.next = $('run-next');
    el.list = $('run-chimes'); el.lock = $('lock-icon'); el.tip = $('wake-tip');
    el.banner = $('chime-banner'); el.bannerText = $('chime-banner-text'); el.bannerStop = $('chime-banner-stop');

    el.ring.setAttribute('stroke-dasharray', CIRC.toFixed(2));
    el.ring.setAttribute('stroke-dashoffset', '0');
    el.ring.setAttribute('transform', 'rotate(-90 150 150)');

    el.cancel.addEventListener('click', finish);
    el.pause.addEventListener('click', pauseResume);
    el.bannerStop.addEventListener('click', function () { A.stop(true); hideChimeBanner(); });
    W.onChange = renderWake;

    function wake() {                    // back in the foreground: catch up immediately
      if (!R.state) return;
      if (document.visibilityState === 'visible') { W.reacquire(); tick(); }
    }
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);
  };
})();
