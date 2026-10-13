/* The build injects the exact bundled asset list. No remote resources. */
const VERSION = 'potion-brewer-__BUILD_ID__';
const ASSETS = __PRECACHE__;
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('potion-brewer-') && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request, { ignoreVary: true }).then(cached => cached || fetch(event.request).catch(() => event.request.mode === 'navigate' ? caches.match(new URL('./index.html', self.registration.scope), { ignoreVary: true }) : Response.error())));
});
