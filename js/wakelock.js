/**
 * wakelock.js
 * Manages Screen Wake Lock API.
 */

export class WakeLockController {
  constructor() {
    this.wakeLock = null;
  }

  async request() {
    if (!('wakeLock' in navigator)) {
      console.warn('Wake Lock API not supported');
      return false;
    }

    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock acquired');

      this.wakeLock.addEventListener('release', () => {
        console.log('Wake lock released');
        this.wakeLock = null;
      });

      return true;
    } catch (err) {
      console.error('Wake lock request failed:', err);
      return false;
    }
  }

  release() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }
}

export const wakeLockController = new WakeLockController();
