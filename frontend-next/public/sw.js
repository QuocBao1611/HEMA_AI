const CACHE_NAME = 'hemavision-pwa-cache-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Chỉ cache một số assets cơ bản nhất
      return cache.addAll([
        '/',
        '/manifest.webmanifest',
        '/icons/icon-192x192.png',
        '/icons/icon-512x512.png',
      ]).catch((err) => {
        console.warn('PWA Install: Caching failed (not fatal)', err);
      });
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

// Network-first strategy cho API, Stale-while-revalidate cho assets
self.addEventListener('fetch', (event) => {
  // Bỏ qua các request POST, PUT, DELETE, v.v.
  if (event.request.method !== 'GET') return;
  
  // Bỏ qua các request API để luôn lấy dữ liệu mới nhất
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request).then((response) => {
        // Cập nhật cache ngầm
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // Fallback về cache nếu offline (nếu có)
        return cachedResponse;
      });

      return cachedResponse || networkFetch;
    })
  );
});
