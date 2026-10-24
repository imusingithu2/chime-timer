const APP_VERSION = '1.0.0';
const CACHE_NAME = `chime-timer-v${APP_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/base.css',
  './styles/picker.css',
  './styles/components.css',
  './styles/running.css',
  './js/main.js',
  './js/timer-engine.js',
  './js/audio.js',
  './js/storage.js',
  './js/wakelock.js',
  './js/settings.js',
  './js/ui-picker.js',
  './js/ui-main.js',
  './js/ui-chimes.js',
  './js/ui-sheet.js',
  './js/ui-running.js',
  './sounds/Bell.wav',
  './sounds/Chime.wav',
  './sounds/Marimba.wav',
  './sounds/Beacon.wav',
  './sounds/Pulse.wav',
  './sounds/Digital.wav',
  './sounds/silent.wav',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
