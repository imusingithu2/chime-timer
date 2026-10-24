/**
 * audio.js
 * Handles sound playback and iOS audio unlocking.
 */

export class AudioController {
  constructor() {
    this.sounds = {};
    this.isUnlocked = false;
    this.bannerCallback = null;
  }

  /**
   * Preloads all sounds from the sounds/ directory.
   */
  async preload() {
    const soundList = ['Bell', 'Chime', 'Marimba', 'Beacon', 'Pulse', 'Digital', 'silent'];
    const promises = soundList.map(async (name) => {
      const audio = new Audio(`./sounds/${name}.wav`);
      audio.preload = 'auto';
      this.sounds[name] = audio;
    });
    await Promise.all(promises);
  }

  /**
   * Unlocks audio on iOS by playing and pausing all sounds.
   * Must be called within a user gesture.
   */
  async unlock() {
    const unlockPromises = Object.values(this.sounds).map(async (audio) => {
      try {
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      } catch (e) {
        console.warn('Audio unlock failed for a sound:', e);
      }
    });
    await Promise.all(unlockPromises);
    this.isUnlocked = true;
  }

  /**
   * Plays a sound for a specific duration.
   */
  playRing(soundName, durationSeconds) {
    const audio = this.sounds[soundName];
    if (!audio) {
      console.error(`Sound ${soundName} not found`);
      return;
    }

    // Stop any other ring currently playing to avoid overlap
    this.stopAll();

    audio.loop = true;

    audio.play().catch(err => {
      console.error('Playback failed:', err);
      if (this.bannerCallback) {
        this.bannerCallback('Sound blocked - tap anywhere to enable');
      }
    });

    setTimeout(() => {
      this.stopRing(soundName);
    }, durationSeconds * 1000);
  }

  stopRing(soundName) {
    const audio = this.sounds[soundName];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  stopAll() {
    Object.values(this.sounds).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
  }

  setBannerCallback(cb) {
    this.bannerCallback = cb;
  }
}

export const audioController = new AudioController();
