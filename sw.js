/* sw.js - offline cache for Chime Timer.
   The version comes from js/version.js (single source of truth): bump it on every deploy. */
importScripts('./js/version.js');

const CACHE = 'chime-timer-v' + self.APP_VERSION;
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/base.css',
  './styles/picker.css',
  './styles/components.css',
  './styles/running.css',
  './js/version.js',
  './js/engine.js',
  './js/platform.js',
  './js/ui-widgets.js',
  './js/ui-chimes.js',
  './js/ui-running.js',
  './js/ui-main.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './sounds/Beacon.wav',
  './sounds/Bell.wav',
  './sounds/Chime.wav',
  './sounds/Digital.wav',
  './sounds/Marimba.wav',
  './sounds/Pulse.wav',
  './sounds/silent.wav'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) =>
        // cache:'reload' bypasses the browser HTTP cache so a new version never stores stale files
        fetch(new Request(url, { cache: 'reload' })).then((res) => {
          if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
          return cache.put(url, res);
        }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('chime-timer-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Safari asks audio files with a Range header; answer from the full cached file. */
async function rangeResponse(request, cached) {
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (!m) return cached;
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/wav',
      'Content-Length': String(end - start + 1),
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isNav = req.mode === 'navigate';
    const key = isNav ? './index.html' : req.url;
    const cached = await cache.match(key, { ignoreSearch: true });

    // Stale-while-revalidate: answer from cache now, refresh the cache in the background.
    const refresh = fetch(isNav ? req : new Request(req.url), { cache: 'no-cache' }).then((res) => {
      if (res && res.ok && res.status === 200) cache.put(key, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(refresh);
      return req.headers.has('range') ? rangeResponse(req, cached) : cached;
    }
    const res = await refresh;
    if (res) return res;
    if (isNav) { const fallback = await cache.match('./'); if (fallback) return fallback; }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
