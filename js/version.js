/* Single source of truth for the app version.
   Loaded by index.html and by sw.js (importScripts). Bump it on EVERY deploy,
   otherwise iPhones keep serving the cached copy of the old app. */
self.APP_VERSION = '1.1.0';
