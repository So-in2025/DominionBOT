
/* Dominion SW v2.7 */
const CACHE_NAME = 'dominion-v2.7-cache';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through strategy para asegurar conectividad con el API
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
