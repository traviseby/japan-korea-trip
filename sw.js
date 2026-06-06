// Supertrip — Service Worker
// Caches the app shell + CartoCDN map tiles + Unsplash hero images so the
// app works in airplane mode.
const VERSION    = 'v9';
const SHELL      = 'jk26-shell-' + VERSION;
const TILES      = 'jk26-tiles-' + VERSION;
const IMAGES     = 'jk26-images-' + VERSION;
const RUNTIME    = 'jk26-runtime-' + VERSION;
const KEEP       = new Set([SHELL, TILES, IMAGES, RUNTIME]);

// App-shell files to pre-cache on install. The page provides exact relative URLs
// during registration so we don't hard-code paths here — see APP_SHELL message
// handler below.
let APP_SHELL = [];

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !KEEP.has(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', async e => {
  const data = e.data || {};
  if (data.type === 'precache-shell'){
    APP_SHELL = data.urls || [];
    const cache = await caches.open(SHELL);
    await Promise.all(APP_SHELL.map(async u => {
      try { await cache.add(new Request(u, { cache: 'reload' })); } catch {}
    }));
    if (e.source) e.source.postMessage({ type: 'shell-cached' });
  }
  if (data.type === 'precache-tiles'){
    const urls = data.urls || [];
    const cache = await caches.open(TILES);
    let done = 0;
    // limited concurrency
    const queue = [...urls];
    const worker = async () => {
      while (queue.length){
        const url = queue.shift();
        try {
          const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
          if (res && res.ok) await cache.put(url, res.clone());
        } catch {}
        done++;
        if (e.source) e.source.postMessage({ type: 'precache-progress', done, total: urls.length });
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (e.source) e.source.postMessage({ type: 'precache-done', done, total: urls.length });
  }
  if (data.type === 'cache-status'){
    const tiles  = await (await caches.open(TILES)).keys();
    const images = await (await caches.open(IMAGES)).keys();
    if (e.source) e.source.postMessage({ type: 'cache-status', tiles: tiles.length, images: images.length });
  }
  if (data.type === 'clear-caches'){
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    if (e.source) e.source.postMessage({ type: 'caches-cleared' });
  }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // CartoCDN tiles — cache-first with network fallback, save on miss.
  if (url.hostname.includes('basemaps.cartocdn.com')){
    e.respondWith(cacheFirst(req, TILES));
    return;
  }

  // Unsplash hero images — cache-first.
  if (url.hostname.includes('unsplash.com')){
    e.respondWith(cacheFirst(req, IMAGES));
    return;
  }

  // Google Fonts (CSS + woff2) — cache-first.
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')){
    e.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  // Leaflet CDN — cache-first.
  if (url.hostname.includes('unpkg.com')){
    e.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  // Open-Meteo weather — network-only with cache fallback (so airplane mode
  // shows the last fetched value rather than nothing).
  if (url.hostname.includes('open-meteo.com')){
    e.respondWith(networkWithCacheFallback(req, RUNTIME));
    return;
  }

  // Same-origin app files — network-first so updates are immediate; cache used
  // only as offline fallback.
  if (url.origin === self.location.origin){
    e.respondWith(networkFirstFallback(req, SHELL));
    return;
  }
});

async function networkFirstFallback(req, cacheName){
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok){
      // Compare against the cached copy. If the body has changed, tell all
      // open clients there's an update so they can show a refresh banner.
      try {
        const cached = await cache.match(req);
        if (cached){
          const [newTxt, oldTxt] = await Promise.all([res.clone().text(), cached.clone().text()]);
          if (newTxt !== oldTxt){
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach(c => c.postMessage({ type: 'update-available', url: req.url }));
          }
        }
      } catch {}
      cache.put(req, res.clone()).catch(()=>{});
    }
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response('', { status: 504 });
  }
}

async function cacheFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreVary: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(()=>{});
    return res;
  } catch (err){
    return cached || new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(()=>{});
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkWithCacheFallback(req, cacheName){
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(()=>{});
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
