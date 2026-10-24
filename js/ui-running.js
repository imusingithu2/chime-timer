/**
 * ui-running.js
 * Manages the running and ended screens.
 */
import { audioController } from './audio.js';
import { wakeLockController } from './wakelock.js';
import { Status, elapsedMs, dueEvents } from './timer-engine.js';

export class RunningUI {
  constructor(mainUI) {
    this.mainUI = mainUI;
    this.screen = document.getElementById('running-screen');
    this.display = document.getElementById('timer-display');
    this.progressRing = document.getElementById('progress-ring');
    this.endTimeText = document.getElementById('end-time-text');
    this.nextChimeText = document.getElementById('next-chime-text');
    this.btnCancel = document.getElementById('run-btn-cancel');
    this.btnPause = document.getElementById('run-btn-pause');

    this.timerInterval = null;
    this.state = null;

    this.btnCancel.onclick = () => this.handleCancel();
    this.btnPause.onclick = () => this.handlePauseResume();
  }

  async start(state) {
    this.state = state;
    this.screen.style.display = 'flex';

    // 1. Request Wake Lock
    await wakeLockController.request();

    // 2. Unlock Audio
    await audioController.unlock();

    // 3. Update End Time
    this.updateEndTime();

    // 4. Start Ticking
    this.startTicking();
  }

  updateEndTime() {
    const now = Date.now();
    const remaining = this.state.totalMs - elapsedMs(this.state, now);
    const endTime = new Date(now + remaining);
    this.endTimeText.textContent = endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  startTicking() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const tick = () => {
      const now = Date.now();
      const elapsed = elapsedMs(this.state, now);
      const remaining = this.state.totalMs - elapsed;

      // Update Display
      this.display.textContent = this.formatMs(remaining);

      // Update Ring (dashoffset)
      const circumference = 2 * Math.PI * 140; // r=140
      const offset = circumference - (elapsed / this.state.totalMs) * circumference;
      this.progressRing.style.strokeDashoffset = offset;

      // Check Events
      const events = dueEvents(this.state, now);

      // Handle Chimes
      events.chimes.forEach(chime => {
        this.triggerChime(chime);
        this.state.firedChimeIds = [...(this.state.firedChimeIds || []), chime.id];
      });

      // Handle End
      if (events.end) {
        this.triggerEnd();
      }

      // Update Next Chime Text
      this.updateNextChime(now);
    };

    this.timerInterval = setInterval(tick, 100);
    tick(); // immediate first tick
  }

  triggerChime(chime) {
    audioController.playRing(chime.sound, chime.ringSeconds);
    // Brief banner implementation (simple alert or DOM element)
    const banner = document.createElement('div');
    banner.style = 'position:absolute; top:50px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:10px 20px; border-radius:20px; z-index:100;';
    banner.textContent = `Chime - ${this.formatMs(chime.atElapsedMs)}`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3000);
  }

  triggerEnd() {
    this.stopTicking();
    this.state.status = Status.ENDED;
    audioController.playRing(this.state.endSound, this.state.endRingSeconds);

    this.display.textContent = '00:00:00';
    this.progressRing.style.strokeDashoffset = 0;
    this.btnPause.textContent = 'Stop';
    this.btnPause.className = 'circle-btn stop'; // orange/red
    this.btnPause.onclick = () => this.handleStop();
  }

  updateNextChime(now) {
    const elapsed = elapsedMs(this.state, now);
    const resolved = this.state.chimes
      .map(c => ({...c, atElapsedMs: c.mode === 'fromStart' ? c.time : this.state.totalMs - c.time}))
      .filter(c => c.atElapsedMs > elapsed)
      .sort((a, b) => a.atElapsedMs - b.atElapsedMs);

    if (resolved.length > 0) {
      const next = resolved[0];
      const diff = next.atElapsedMs - elapsed;
      this.nextChimeText.textContent = `Next chime in ${this.formatMs(diff)}`;
    } else {
      this.nextChimeText.textContent = 'No more chimes';
    }
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

  handleCancel() {
    this.stopTicking();
    wakeLockController.release();
    audioController.stopAll();
    this.screen.style.display = 'none';
    this.mainUI.handleCancel();
  }

  handleStop() {
    this.stopTicking();
    wakeLockController.release();
    audioController.stopAll();
    this.screen.style.display = 'none';
    this.mainUI.handleCancel();
  }

  stopTicking() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  formatMs(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
