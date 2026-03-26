// sw.js
const CACHE_NAME = 'ceo-planner-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './js/bundle.js',
  './css/index.css'
];

// Install the caching background worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Intercept fetch requests for lightning fast loading
self.addEventListener('fetch', event => {
  // Try network first, then fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Handle incoming local notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus the open tab if it exists
      for (let client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab/window wrapper
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
