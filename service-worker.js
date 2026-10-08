const CACHE_NAME = 'intranet-shell-v20261008-1';
const STATIC_SHELL = [
  './',
  './index.html',
  './intranet.html',
  './manifest.webmanifest',
  './favicon.svg',
  './pwa-icon-192.png',
  './pwa-icon-512.png',
  './shared/css/pwa-responsive.css',
  './shared/js/pwa-install.js',
  './shared/js/acessibilidade-intranet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache Supabase/API responses, sessions, reports or financial data.
  if (url.pathname.includes('/rest/') || url.pathname.includes('/auth/') || url.pathname.includes('/functions/') || url.search.includes('supabase')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.webmanifest'))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request)));
});
