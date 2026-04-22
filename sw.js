/* ── GrungeTab · sw.js ── */

const CACHE_NAME = 'grungetab-__CACHE_VERSION__';

// Cache separado para archivos del usuario (docs/txt/pdf) ya abiertos.
// No incluye el version hash: debe sobrevivir a los deploys.
const OFFLINE_CACHE = 'grungetab-offline-files';

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/config.js',
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
                  .filter((key) => key !== CACHE_NAME && key !== OFFLINE_CACHE)
                  .map((key) => caches.delete(key))
          )
      )
  );
  self.clients.claim();
});

// Fetch:
// - Mismo origen: network-first con fallback a cache. Garantiza que un deploy
//   nuevo se vea en la primera recarga si hay red, manteniendo modo offline.
//   Cada respuesta OK refresca la entrada cacheada.
// - Cross-origin (Google APIs, CDNs): no interceptar, que el browser lo maneje.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
      fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => caches.match(req).then((cached) => cached || Response.error()))
  );
});
