/* Simple offline-capable service worker for b4u.golf */
/* Bump this version any time you change site files — forces all clients to re-fetch. */
const CACHE = 'b4u-golf-v8-2026-04-26-wordmark';
const ASSETS = [
  '/',
  '/index.html',
  '/weather.html',
  '/courses.html',
  '/checklist.html',
  '/etiquette.html',
  '/equipment.html',
  '/tips.html',
  '/scorecard.html',
  '/members.html',
  '/about.html',
  '/styles.css',
  '/script.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Receive activation request from page when a new version is ready
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache-first for our own static assets; let API calls go straight to network.
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(event.request, copy));
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});
