/**
 * main.js
 * Entry point of the application.
 */
import { mainUI } from './ui-main.js';

window.addEventListener('DOMContentLoaded', () => {
  mainUI.init().catch(err => {
    console.error('App failed to initialize:', err);
  });
});
