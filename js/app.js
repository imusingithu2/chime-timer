/**
 * app.js - Bundled Application Logic
 * Consolidated to avoid ES Module path issues on GitHub Pages.
 */

// --- 1. TIMER ENGINE ---
const Status = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  ENDED: 'ended'
};

function elapsedMs(state, now) {
  let elapsed = state.accumulatedMs || 0;
  if (state.status === Status.RUNNING && state.lastResumeAt) {
    elapsed += (now - state.lastResumeAt);
  }
  return Math.max(0, Math.min(elapsed, state.totalMs || 0));
}

function resolveChimes(chimes, totalMs) {
  if (!chimes) return [];
  const resolved = chimes.map(chime => {
    let atElapsedMs = chime.mode === 'fromStart' ? chime.time : totalMs - chime.time;
    const valid = atElapsedMs > 0 && atElapsedMs < totalMs;
    return { ...chime, atElapsedMs, valid };
  });
  resolved.sort((a, b) => a.atElapsedMs - b.atElapsedMs);
  const merged = [];
  for (const chime of resolved) {
    if (merged.length > 0 && merged[merged.length - 1].atElapsedMs === chime.atElapsedMs) {
      merged[merged.length - 1].ringSeconds = Math.max(merged[merged.length - 1].ringSeconds, chime.ringSeconds);
    } else {
      merged.push({ ...chime });
    }
  }
  return merged;
}

function dueEvents(state, now) {
  const elapsed = elapsedMs(state, now);
  const due = { chimes: [], end: false, missed: [] };
  const resolved = resolveChimes(state.chimes, state.totalMs);
  for (const chime of resolved) {
    if (!chime.valid) continue;
    if (state.firedChimeIds && state.firedChimeIds.includes(chime.id)) continue;
    if (elapsed >= chime.atElapsedMs) {
      if (elapsed - chime.atElapsedMs <= 2000) due.chimes.push(chime);
      else due.missed.push(chime.id);
    }
  }
  if (elapsed >= state.totalMs && state.status !== Status.ENDED) due.end = true;
  return due;
}

function createTimerState(totalMs, label = '', chimes = []) {
  return { status: Status.IDLE, totalMs, accumulatedMs: 0, lastResumeAt: null, chimes, endRingSeconds: 3, firedChimeIds: [], missedIds: [], label };
}

// --- 2. STORAGE ---
const Storage = {
  save: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  load: (k) => { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : null; } catch(e){ return null; } },
  clear: (k) => { try { localStorage.removeItem(k); } catch(e){} }
};

// --- 3. AUDIO ---
class AudioController {
  constructor() {
    this.sounds = {};
    this.bannerCallback = null;
  }
  async preload() {
    const list = ['Bell', 'Chime', 'Marimba', 'Beacon', 'Pulse', 'Digital', 'silent'];
    await Promise.all(list.map(async name => {
      const a = new Audio(`./sounds/${name}.wav`);
      a.preload = 'auto';
      this.sounds[name] = a;
    }));
  }
  async unlock() {
    await Promise.all(Object.values(this.sounds).map(async a => {
      try { a.muted = true; await a.play(); a.pause(); a.currentTime = 0; a.muted = false; } catch(e){}
    }));
  }
  playRing(name, dur) {
    const a = this.sounds[name];
    if (!a) return;
    this.stopAll();
    a.loop = true;
    a.play().catch(e => { if(this.bannerCallback) this.bannerCallback('Sound blocked - tap anywhere to enable'); });
    setTimeout(() => this.stopRing(name), dur * 1000);
  }
  stopRing(name) {
    const a = this.sounds[name];
    if (a) { a.pause(); a.currentTime = 0; }
  }
  stopAll() {
    Object.values(this.sounds).forEach(a => { a.pause(); a.currentTime = 0; });
  }
}
const audioController = new AudioController();

// --- 4. WAKELOCK ---
class WakeLockController {
  constructor() { this.wakeLock = null; }
  async request() {
    if (!('wakeLock' in navigator)) return false;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => this.wakeLock = null);
      return true;
    } catch(e) { return false; }
  }
  release() { if (this.wakeLock) { this.wakeLock.release(); this.wakeLock = null; } }
}
const wakeLockController = new WakeLockController();

// --- 5. UI COMPONENTS ---
class Picker {
  constructor(el, { min = 0, max = 59, initialValue = 0, onChange = () => {} }) {
    this.el = el; this.min = min; this.max = max; this.value = initialValue; this.onChange = onChange;
    this.init();
  }
  init() {
    this.el.innerHTML = '';
    const spacer = document.createElement('div'); spacer.className = 'picker-item'; spacer.style.height = '110px';
    this.el.appendChild(spacer.cloneNode());
    for (let i = this.min; i <= this.max; i++) {
      const d = document.createElement('div'); d.className = 'picker-item'; d.textContent = i.toString().padStart(2, '0');
      this.el.appendChild(d);
    }
    this.el.appendChild(spacer);
    this.el.addEventListener('scrollend', () => this.updateValue());
    this.el.addEventListener('scroll', () => {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => this.updateValue(), 150);
    });
    this.scrollToValue(this.value);
  }
  scrollToValue(val) { this.el.scrollTop = (val - this.min) * 44; }
  updateValue() {
    const newVal = this.min + Math.round(this.el.scrollTop / 44);
    if (newVal >= this.min && newVal <= this.max && newVal !== this.value) {
      this.value = newVal; this.onChange(this.value);
    }
  }
  getValue() { return this.value; }
}

class Sheet {
  constructor() {
    this.el = document.getElementById('sheet');
    this.backdrop = document.getElementById('sheet-backdrop');
    this.titleEl = document.getElementById('sheet-title');
    this.contentEl = document.getElementById('sheet-content');
    this.btnCancel = document.getElementById('sheet-btn-cancel');
    this.btnDone = document.getElementById('sheet-btn-done');
    this.btnCancel.onclick = () => this.close();
    this.backdrop.onclick = () => this.close();
    this.btnDone.onclick = () => { if(this.onDone) this.onDone(); this.close(); };
  }
  open(title, html, { onCancel = null, onDone = null } = {}) {
    this.titleEl.textContent = title; this.contentEl.innerHTML = html;
    this.onCancel = onCancel; this.onDone = onDone;
    this.backdrop.style.display = 'block'; this.el.classList.add('open');
  }
  close() {
    this.el.classList.remove('open'); this.backdrop.style.display = 'none';
    if (this.onCancel) this.onCancel();
  }
}
const sheet = new Sheet();

class ChimesUI {
  constructor(container, storage, audio) {
    this.container = container; this.storage = storage; this.audio = audio;
    this.state = { chimes: [] }; this.onUpdate = null;
  }
  render(chimes) {
    this.state.chimes = chimes; this.container.innerHTML = '';
    if (!chimes.length) {
      this.container.innerHTML = '<div class="row" style="color: var(--secondary-text); justify-content: center;">No chimes added</div>';
      return;
    }
    chimes.forEach(c => {
      const r = document.createElement('div'); r.className = 'row';
      const timeStr = this.formatTime(c.time);
      const modeStr = c.mode === 'fromStart' ? 'after start' : 'before end';
      r.innerHTML = `<span class="row-label">${timeStr} ${modeStr} - ${c.ringSeconds}s - ${c.sound}</span><span class="chevron"></span>`;
      r.onclick = () => this.editChime(c);
      this.container.appendChild(r);
    });
  }
  formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600)}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }
  editChime(c) {
    const html = `<div class="list-group">
      <div class="group-section"><div class="group-header">Duration</div>
        <div class="picker-container"><div class="picker-mask"></div><div id="chime-picker-wheel" class="picker-wheel"></div><div class="picker-band"></div><div class="picker-unit">time</div></div>
      </div>
      <div class="group-section"><div class="card">
        <div class="row"><span class="row-label">Mode</span><select id="chime-mode" style="background:none;color:var(--text-color);border:none;font-size:17px;"><option value="fromStart" ${c.mode === 'fromStart'?'selected':''}>From start</option><option value="beforeEnd" ${c.mode === 'beforeEnd'?'selected':''}>Before end</option></select></div>
        <div class="row"><span class="row-label">Ring for</span><input type="number" id="chime-ring-sec" value="${c.ringSeconds}" min="1" max="60" style="width:50px;background:none;color:var(--text-color);border:1px solid var(--separator-color);text-align:center;"><span class="row-value">s</span></div>
        <div class="row"><span class="row-label">Sound</span><select id="chime-sound" style="background:none;color:var(--text-color);border:none;font-size:17px;">${['Bell','Chime','Marimba','Beacon','Pulse','Digital'].map(s => `<option value="${s}" ${c.sound===s?'selected':''}>${s}</option>`).join('')}</select><button id="chime-preview" class="sheet-btn" style="margin-left:10px;">Preview</button></div>
      </div></div></div>`;
    sheet.open('Edit Chime', html, {
      onDone: () => {
        const updated = { ...c, time: this.currentPicker.getValue() * 1000, mode: document.getElementById('chime-mode').value, ringSeconds: parseInt(document.getElementById('chime-ring-sec').value), sound: document.getElementById('chime-sound').value };
        const idx = this.state.chimes.findIndex(x => x.id === c.id);
        if (idx !== -1) this.state.chimes[idx] = updated;
        if (this.onUpdate) this.onUpdate(this.state.chimes);
      }
    });
    setTimeout(() => {
      this.currentPicker = new Picker(document.getElementById('chime-picker-wheel'), { min: 0, max: 359999, initialValue: c.time / 1000 });
      document.getElementById('chime-preview').onclick = () => this.audio.playRing(document.getElementById('chime-sound').value, 1.5);
    }, 100);
  }
}

class RunningUI {
  constructor(mainUI) {
    this.mainUI = mainUI;
    this.screen = document.getElementById('running-screen');
    this.display = document.getElementById('timer-display');
    this.progressRing = document.getElementById('progress-ring');
    this.endTimeText = document.getElementById('end-time-text');
    this.nextChimeText = document.getElementById('next-chime-text');
    this.btnCancel = document.getElementById('run-btn-cancel');
    this.btnPause = document.getElementById('run-btn-pause');
    this.btnCancel.onclick = () => this.handleCancel();
    this.btnPause.onclick = () => this.handlePauseResume();
  }
  async start(state) {
    this.state = state;
    this.screen.style.display = 'flex';
    await wakeLockController.request();
    await audioController.unlock();
    this.updateEndTime();
    this.startTicking();
  }
  updateEndTime() {
    const remaining = this.state.totalMs - elapsedMs(this.state, Date.now());
    this.endTimeText.textContent = new Date(Date.now() + remaining).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  startTicking() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const tick = () => {
      const now = Date.now();
      const elapsed = elapsedMs(this.state, now);
      const remaining = this.state.totalMs - elapsed;
      this.display.textContent = this.formatMs(remaining);
      this.progressRing.style.strokeDashoffset = (2 * Math.PI * 140) * (1 - elapsed / this.state.totalMs);
      const events = dueEvents(this.state, now);
      events.chimes.forEach(c => {
        audioController.playRing(c.sound, c.ringSeconds);
        this.state.firedChimeIds = [...(this.state.firedChimeIds || []), c.id];
        const banner = document.createElement('div');
        banner.style = 'position:absolute;top:50px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:white;padding:10px 20px;border-radius:20px;z-index:100;';
        banner.textContent = `Chime - ${this.formatMs(c.atElapsedMs)}`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 3000);
      });
      if (events.end) {
        this.stopTicking();
        this.state.status = Status.ENDED;
        audioController.playRing(this.state.endSound, this.state.endRingSeconds);
        this.display.textContent = '00:00:00';
        this.btnPause.textContent = 'Stop';
        this.btnPause.className = 'circle-btn stop';
        this.btnPause.onclick = () => this.handleStop();
      }
      this.updateNextChime(now);
    };
    this.timerInterval = setInterval(tick, 100);
    tick();
  }
  updateNextChime(now) {
    const elapsed = elapsedMs(this.state, now);
    const resolved = this.state.chimes.map(c => ({...c, atElapsedMs: c.mode === 'fromStart' ? c.time : this.state.totalMs - c.time}))
      .filter(c => c.atElapsedMs > elapsed).sort((a, b) => a.atElapsedMs - b.atElapsedMs);
    this.nextChimeText.textContent = resolved.length ? `Next chime in ${this.formatMs(resolved[0].atElapsedMs - elapsed)}` : 'No more chimes';
  }
  handlePauseResume() {
    if (this.state.status === Status.RUNNING) {
      this.state.status = Status.PAUSED;
      this.btnPause.textContent = 'Resume';
      this.btnPause.className = 'circle-btn resume';
      audioController.stopAll();
    } else {
      this.state.status = Status.RUNNING;
      this.btnPause.textContent = 'Pause';
      this.btnPause.className = 'circle-btn pause';
      wakeLockController.request();
      audioController.unlock();
    }
  }
  handleCancel() { this.stopTicking(); wakeLockController.release(); audioController.stopAll(); this.screen.style.display = 'none'; this.mainUI.handleCancel(); }
  handleStop() { this.handleCancel(); }
  stopTicking() { clearInterval(this.timerInterval); this.timerInterval = null; }
  formatMs(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }
}

// --- 6. MAIN UI ---
class MainUI {
  constructor() {
    this.state = { totalMs: 0, label: 'None', chimes: [], endSound: 'Bell', endRingSeconds: 3 };
    this.init();
  }
  async init() {
    const saved = Storage.load('draft_timer');
    if (saved) this.state = { ...this.state, ...saved };
    this.runningUI = new RunningUI(this);
    this.setupDurationPicker();
    const chimesList = document.getElementById('chimes-list');
    this.chimesUI = new ChimesUI(chimesList, Storage, audioController);
    this.chimesUI.onUpdate = (c) => { this.state.chimes = c; this.saveDraft(); this.chimesUI.render(c); };
    this.chimesUI.render(this.state.chimes);
    document.getElementById('btn-start').onclick = () => this.handleStart();
    document.getElementById('btn-cancel').onclick = () => this.handleCancel();
    document.getElementById('btn-add-chime').onclick = () => this.handleAddChime();
    document.getElementById('row-label').onclick = () => this.editLabel();
    document.getElementById('row-end-settings').onclick = () => this.editEndSettings();
    document.getElementById('row-settings').onclick = () => this.openSettings();
    this.updateUI();
    await audioController.preload();
  }
  setupDurationPicker() {
    const container = document.getElementById('duration-picker');
    container.innerHTML = '';
    const wheelContainer = document.createElement('div');
    wheelContainer.style.display = 'flex'; wheelContainer.style.justifyContent = 'center'; wheelContainer.style.width = '100%';
    this.durationPickers = [
      { id: 'h', p: new Picker(this.createWheel(wheelContainer), { min: 0, max: 23, onChange: () => this.updateTotal() }) },
      { id: 'm', p: new Picker(this.createWheel(wheelContainer), { min: 0, max: 59, onChange: () => this.updateTotal() }) },
      { id: 's', p: new Picker(this.createWheel(wheelContainer), { min: 0, max: 59, onChange: () => this.updateTotal() }) },
    ];
    container.appendChild(wheelContainer);
    const totalSeconds = this.state.totalMs / 1000;
    this.durationPickers[0].p.scrollToValue(Math.floor(totalSeconds / 3600));
    this.durationPickers[1].p.scrollToValue(Math.floor((totalSeconds % 3600) / 60));
    this.durationPickers[2].p.scrollToValue(Math.floor(totalSeconds % 60));
  }
  createWheel(parent) {
    const el = document.createElement('div'); el.className = 'picker-wheel'; el.style.width = '80px';
    parent.appendChild(el); return el;
  }
  updateTotal() {
    this.state.totalMs = (this.durationPickers[0].p.getValue() * 3600 + this.durationPickers[1].p.getValue() * 60 + this.durationPickers[2].p.getValue()) * 1000;
    this.saveDraft(); this.updateUI();
  }
  updateUI() {
    document.getElementById('btn-start').className = this.state.totalMs > 0 ? 'circle-btn start' : 'circle-btn start disabled';
    document.getElementById('row-label').querySelector('.row-value').textContent = this.state.label;
    document.getElementById('row-end-settings').querySelector('.row-value').textContent = `${this.state.endSound}, ${this.state.endRingSeconds}s`;
  }
  saveDraft() { Storage.save('draft_timer', this.state); }
  handleStart() {
    if (this.state.totalMs <= 0) return;
    this.runningUI.start({ ...createTimerState(this.state.totalMs, this.state.label, this.state.chimes), status: 'running', lastResumeAt: Date.now(), endSound: this.state.endSound, endRingSeconds: this.state.endRingSeconds });
  }
  handleCancel() {
    this.state.totalMs = 0; this.durationPickers.forEach(wp => wp.p.scrollToValue(0));
    this.state.chimes = []; this.chimesUI.render([]); this.saveDraft(); this.updateUI();
  }
  handleAddChime() {
    const c = { id: 'chime_' + Date.now(), mode: 'fromStart', time: 60000, ringSeconds: 3, sound: this.state.endSound };
    this.state.chimes = [...this.state.chimes, c]; this.chimesUI.render(this.state.chimes); this.saveDraft();
  }
  editLabel() {
    sheet.open('Label', `<div class="list-group"><div class="card"><div class="row"><input id="label-input" value="${this.state.label}" style="width:100%;background:none;color:var(--text-color);border:none;font-size:17px;"></div></div></div>`, {
      onDone: () => { this.state.label = document.getElementById('label-input').value || 'None'; this.updateUI(); this.saveDraft(); }
    });
  }
  editEndSettings() {
    sheet.open('When Timer Ends', `<div class="list-group"><div class="card">
      <div class="row"><span class="row-label">Sound</span><select id="end-sound" style="background:none;color:var(--text-color);border:none;font-size:17px;">${['Bell','Chime','Marimba','Beacon','Pulse','Digital'].map(s => `<option value="${s}" ${this.state.endSound===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="row"><span class="row-label">Ring for</span><input type="number" id="end-ring-sec" value="${this.state.endRingSeconds}" min="1" max="60" style="width:50px;background:none;color:var(--text-color);border:1px solid var(--separator-color);text-align:center;"><span class="row-value">s</span></div>
    </div></div>`, {
      onDone: () => { this.state.endSound = document.getElementById('end-sound').value; this.state.endRingSeconds = parseInt(document.getElementById('end-ring-sec').value); this.updateUI(); this.saveDraft(); }
    });
  }
  openSettings() { sheet.open('Settings', '<div class="row">Setting content coming soon...</div>'); }
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const app = new MainUI();
    await app.init();
  } catch (e) {
    console.error(e);
    alert('App failed to load. Please refresh.');
  }
});
