// sw.js
// Bump CACHE_NAME and these ?v= numbers whenever the bundle version in
// index.html changes. Fetching is network-first, so a stale list does not break
// normal loading, but it is what an offline user gets served, and serving a
// bundle from before the card-free trial change would be worse than nothing.
const CACHE_NAME = 'ceo-planner-cache-v51';
const urlsToCache = [
  './',
  './index.html',
  './js/bundle.js?v=51',
  './css/variables.css?v=16',
  './css/styles.css?v=16',
  './css/components.css?v=18',
  './favicon.ico',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

// Install the caching background worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Clean up old caches on activation and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
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
