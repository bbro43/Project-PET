importScripts('./release.js');
const { app, assets } = self.PROJECT_PET_RELEASE;
const scope = self.registration.scope;
// Cache names from every release use these prefixes so older caches can be removed.
const prefixes = ['signal-yard:' + scope + ':', 'project-pet:' + scope + ':'];
const cacheName = prefixes[1] + app + ':assets-' + assets;
const shell = [
  '', 'index.html', 'release.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'src/ui/app.mjs', 'src/ui/render.mjs', 'src/battle/engine.mjs', 'src/battle/viruses.mjs',
  'src/rom/gba.mjs', 'src/rom/zip.mjs', 'src/rom/lz77.mjs', 'src/rom/sprite.mjs', 'src/rom/store.mjs', 'src/rom/bank.mjs',
  'data/rules.mjs', 'data/registry.json', 'data/bn6-viruses.mjs',
  'prototype/', 'prototype/index.html', 'prototype/client.mjs', 'prototype/shared/combat.mjs',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(shell.filter(p => p && !p.endsWith('/')).map(p => new Request(new URL(p, scope), { cache: 'reload' })));
    // 0.1.x installs have no in-app update prompt, so take over immediately once.
    const keys = await caches.keys();
    if (keys.some(k => k.startsWith(prefixes[0]))) self.skipWaiting();
  })());
});

self.addEventListener('message', event => { if (event.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => prefixes.some(p => k.startsWith(p)) && k !== cacheName).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  let path = new URL(request.url).pathname.slice(new URL(scope).pathname.length);
  if (request.mode === 'navigate' && (path === '' || path.endsWith('/'))) path += 'index.html';
  if (!shell.includes(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(new URL(path, scope).href)) || fetch(request);
  })());
});
