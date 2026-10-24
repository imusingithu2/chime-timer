/**
 * storage.js
 * Handles localStorage access with try/catch.
 */

export const Storage = {
  save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Error saving ${key} to localStorage:`, e);
    }
  },

  load(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error(`Error loading ${key} from localStorage:`, e);
      return null;
    }
  },

  clear(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(`Error clearing ${key} from localStorage:`, e);
    }
  }
};
