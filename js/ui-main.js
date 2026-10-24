import { Picker } from './ui-picker.js';
import { sheet } from './ui-sheet.js';
import { ChimesUI } from './ui-chimes.js';
import { audioController } from './audio.js';
import { Storage } from './storage.js';
import { RunningUI } from './ui-running.js';

export class MainUI {
  constructor() {
    this.picker = null;
    this.chimesUI = null;
    this.runningUI = null;
    this.state = {
      totalMs: 0,
      label: 'None',
      chimes: [],
      endSound: 'Bell',
      endRingSeconds: 3
    };

    this.init();
  }

  async init() {
    // Load persisted state
    const saved = Storage.load('draft_timer');
    if (saved) this.state = { ...this.state, ...saved };

    // Init Running UI
    this.runningUI = new RunningUI(this);

    // Init Duration Picker (3 wheels)
    this.setupDurationPicker();

    // Init Chimes
    const chimesList = document.getElementById('chimes-list');
    this.chimesUI = new ChimesUI(chimesList, Storage, audioController);
    this.chimesUI.onUpdate = (chimes) => {
      this.state.chimes = chimes;
      this.saveDraft();
      this.chimesUI.render(chimes);
    };
    this.chimesUI.render(this.state.chimes);

    // Buttons
    document.getElementById('btn-start').onclick = () => this.handleStart();
    document.getElementById('btn-cancel').onclick = () => this.handleCancel();
    document.getElementById('btn-add-chime').onclick = () => this.handleAddChime();

    // Rows
    document.getElementById('row-label').onclick = () => this.editLabel();
    document.getElementById('row-end-settings').onclick = () => this.editEndSettings();
    document.getElementById('row-settings').onclick = () => this.openSettings();

    this.updateUI();
    await audioController.preload();
  }

  setupDurationPicker() {
    const container = document.getElementById('duration-picker');
    container.innerHTML = '';

    // Creating 3 wheels: H, M, S
    const wheels = [
      { id: 'h', min: 0, max: 23, label: 'hours' },
      { id: 'm', min: 0, max: 59, label: 'min' },
      { id: 's', min: 0, max: 59, label: 'sec' },
    ];

    const wheelContainer = document.createElement('div');
    wheelContainer.style.display = 'flex';
    wheelContainer.style.justifyContent = 'center';
    wheelContainer.style.width = '100%';

    const pickers = [];
    wheels.forEach(w => {
      const el = document.createElement('div');
      el.className = 'picker-wheel';
      el.style.width = '80px';
      wheelContainer.appendChild(el);

      const p = new Picker(el, {
        min: w.min,
        max: w.max,
        onChange: () => this.updateTotal(),
      });
      pickers.push({ id: w.id, picker: p });
    });

    container.appendChild(wheelContainer);
    this.durationPickers = pickers;

    // Set initial values from state
    const totalSeconds = this.state.totalMs / 1000;
    this.durationPickers[0].scrollToValue(Math.floor(totalSeconds / 3600));
    this.durationPickers[1].scrollToValue(Math.floor((totalSeconds % 3600) / 60));
    this.durationPickers[2].scrollToValue(Math.floor(totalSeconds % 60));
  }

  updateTotal() {
    const h = this.durationPickers[0].getValue();
    const m = this.durationPickers[1].getValue();
    const s = this.durationPickers[2].getValue();
    this.state.totalMs = (h * 3600 + m * 60 + s) * 1000;
    this.saveDraft();
    this.updateUI();
  }

  updateUI() {
    const btnStart = document.getElementById('btn-start');
    btnStart.className = this.state.totalMs > 0 ? 'circle-btn start' : 'circle-btn start disabled';

    document.getElementById('row-label').querySelector('.row-value').textContent = this.state.label;
    document.getElementById('row-end-settings').querySelector('.row-value').textContent = `${this.state.endSound}, ${this.state.endRingSeconds}s`;
  }

  saveDraft() {
    Storage.save('draft_timer', this.state);
  }

  handleStart() {
    if (this.state.totalMs <= 0) return;

    // Import the actual engine state
    import('./timer-engine.js').then(({ createTimerState }) => {
      const state = createTimerState(this.state.totalMs, this.state.label, this.state.chimes);
      state.endSound = this.state.endSound;
      state.endRingSeconds = this.state.endRingSeconds;

      // Start in RunningUI
      this.runningUI.start({
        ...state,
        status: 'running',
        lastResumeAt: Date.now()
      });
    });
  }

  handleCancel() {
    this.state.totalMs = 0;
    this.durationPickers.forEach(p => p.picker.scrollToValue(0));
    this.state.chimes = [];
    this.chimesUI.render([]);
    this.saveDraft();
    this.updateUI();
  }

  handleAddChime() {
    const newChime = {
      id: 'chime_' + Date.now(),
      mode: 'fromStart',
      time: 60 * 1000,
      ringSeconds: 3,
      sound: this.state.endSound
    };
    const chimes = [...this.state.chimes, newChime];
    this.state.chimes = chimes;
    this.chimesUI.render(chimes);
    this.saveDraft();
  }

  editLabel() {
    sheet.open('Label', `
      <div class="list-group">
        <div class="card">
          <div class="row">
            <input id="label-input" value="${this.state.label}" style="width: 100%; background: none; color: var(--text-color); border: none; font-size: 17px;">
          </div>
        </div>
      </div>
    `, {
      onDone: () => {
        this.state.label = document.getElementById('label-input').value || 'None';
        this.updateUI();
        this.saveDraft();
      }
    });
  }

  editEndSettings() {
    sheet.open('When Timer Ends', `
      <div class="list-group">
        <div class="card">
          <div class="row">
            <span class="row-label">Sound</span>
            <select id="end-sound" style="background: none; color: var(--text-color); border: none; font-size: 17px;">
              ${['Bell', 'Chime', 'Marimba', 'Beacon', 'Pulse', 'Digital'].map(s =>
                `<option value="${s}" ${this.state.endSound === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
          <div class="row">
            <span class="row-label">Ring for</span>
            <input type="number" id="end-ring-sec" value="${this.state.endRingSeconds}" min="1" max="60" style="width: 50px; background: none; color: var(--text-color); border: 1px solid var(--separator-color); text-align: center;">
            <span class="row-value">s</span>
          </div>
        </div>
      </div>
    `, {
      onDone: () => {
        this.state.endSound = document.getElementById('end-sound').value;
        this.state.endRingSeconds = parseInt(document.getElementById('end-ring-sec').value);
        this.updateUI();
        this.saveDraft();
      }
    });
  }

  openSettings() {
    sheet.open('Settings', '<div class="row">Setting content coming in Phase 3/4...</div>');
  }
}

export const mainUI = new MainUI();
