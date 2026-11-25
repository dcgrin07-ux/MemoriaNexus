const CACHE_NAME = 'memoria-nexus-v2';
const APP_PREFIX = 'memoria-nexus-';
const APP_SCOPE = self.registration.scope;
const INDEX_URL = new URL('index.html', APP_SCOPE).href;
const APP_SHELL = [
  INDEX_URL,
  new URL('manifest.webmanifest', APP_SCOPE).href,
  new URL('memoria-nexus-icon-192.png', APP_SCOPE).href,
  new URL('memoria-nexus-icon-512.png', APP_SCOPE).href,
  new URL('memoria-nexus-logo.png', APP_SCOPE).href,
  new URL('nexus-digital-logo.png', APP_SCOPE).href,
  new URL('fondo-memoria-nexus.png', APP_SCOPE).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(APP_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (
    request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    !requestUrl.href.startsWith(APP_SCOPE)
  ) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            return caches.open(CACHE_NAME)
              .then((cache) => cache.put(INDEX_URL, copy))
              .catch(() => {})
              .then(() => response);
          }
          return response;
        })
        .catch(async () => (await caches.match(INDEX_URL)) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {})
            .then(() => response);
        }
        return response;
      }))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(new URL('./', APP_SCOPE).href);
    })
  );
});
