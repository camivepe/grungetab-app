/* ── GrungeTab · sw.js ── */

const CACHE_NAME = 'grungetab-__CACHE_VERSION__';

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
];

// Instalar: cachear assets principales (íconos opcionales)
self.addEventListener('install', (event) => {
  event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        // Cachear core assets — falla si alguno no existe
        return cache.addAll(ASSETS).then(() => {
          // Intentar cachear íconos de forma opcional
          return Promise.allSettled([
            cache.add('/icons/icon-192.png'),
            cache.add('/icons/icon-512.png'),
          ]);
        });
      })
  );
  self.skipWaiting();
});

// Activar: limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
      caches.keys().then((keys) =>
          Promise.all(
              keys
                  .filter((key) => key !== CACHE_NAME)
                  .map((key) => caches.delete(key))
          )
      )
  );
  self.clients.claim();
});

// Fetch: responder desde cache, con fallback a red
self.addEventListener('fetch', (event) => {
  event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request);
      })
  );
});
