/**
 * main.js
 * Entry point of the application.
 */
import { mainUI } from './ui-main.js';

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await mainUI.init();
    console.log('App initialized successfully');
  } catch (err) {
    console.error('App failed to initialize:', err);
    // Show error to user in case they can see the console
    alert('App initialization failed. Please check console for details.');
  }
});
