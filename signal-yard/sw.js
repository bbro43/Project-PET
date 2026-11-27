const version = 'signal-yard-v1';
const scope = self.registration.scope;
const prefix = 'signal-yard:' + scope + ':';
const cacheName = prefix + version;
const shell = ['index.html', 'client.mjs', 'shared/combat.mjs',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    shell.map(path => new Request(new URL(path, scope), { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  const path = request.url.slice(scope.length);
  if (request.mode !== 'navigate' && !shell.includes(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const key = request.mode === 'navigate' ? new URL('index.html', scope).href : request;
    return (await cache.match(key)) || fetch(request);
  })());
});
