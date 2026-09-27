const VERSION = "f21d44505feea840";
const PRECACHE_FILES = ["assets/BufferGeometryUtils-DtOhYK-r.js","assets/GiftRoomScene-CoYu8iq9.js","assets/Lightformer-DoVPN4bG.js","assets/MusicBoxScene-CDRmZXq_.js","assets/ObjectStage-DNIqMDQV.js","assets/ProjectorScene-BGfQF3qN.js","assets/RoundedBox-C19oAuGn.js","assets/TheaterRoom-Rgwrjvl9.js","assets/index-CE_9hWOT.js","assets/index-CQ86EiJR.css","assets/useCursor-Ch5rmAFl.js","index.html","pwa-icon.svg","pwa-manifest.webmanifest"];
const SCOPE = self.registration.scope;
const PREFIX = 'red-velvet-cinema:' + encodeURIComponent(SCOPE) + ':';
const PRECACHE = PREFIX + 'precache:' + VERSION;
const RUNTIME = PREFIX + 'runtime:' + VERSION;
const HOME = new URL('index.html', SCOPE).href;
const CORE_URLS = new Set(PRECACHE_FILES.map(file => new URL(file, SCOPE).href));
const SCOPE_PATH = new URL(SCOPE).pathname;
const RUNTIME_LIMIT = 64;

function cacheable(response, url) {
  return response.status === 200 && response.type === 'basic' &&
    !response.redirected &&
    !/no-store|private/i.test(response.headers.get('cache-control') || '') &&
    (url.pathname.endsWith('.html') ||
      !/text\/html/i.test(response.headers.get('content-type') || ''));
}

async function fetchWithTimeout(request, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(request, { signal: controller.signal, redirect: 'error' });
    await response.clone().arrayBuffer();
    return response;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    try {
      await Promise.all([...CORE_URLS].map(async href => {
        const url = new URL(href);
        const response = await fetchWithTimeout(
          new Request(href, { cache: 'reload', credentials: 'same-origin' }), 15000
        );
        if (!cacheable(response, url)) throw new Error('Offline shell unavailable');
        await cache.put(href, response);
      }));
    } catch (error) {
      await caches.delete(PRECACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) &&
      key !== PRECACHE && key !== RUNTIME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function coreResponse(request, href) {
  try {
    const cache = await caches.open(PRECACHE);
    const cached = await cache.match(href);
    if (cached) return cached;
  } catch {
    // Browsing should still work online if cache storage becomes unavailable.
  }
  try {
    return await fetchWithTimeout(request);
  } catch {
    return new Response('Offline resource unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function localAssetResponse(request, url) {
  let cache;
  try {
    cache = await caches.open(RUNTIME);
    const cached = await cache.match(request);
    if (cached) return cached;
  } catch {
    // Cache storage can be unavailable in private browsing or under quota pressure.
  }
  try {
    const response = await fetchWithTimeout(request);
    if (!cacheable(response, url)) return response;
    if (cache) {
      try {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        await Promise.all(keys.slice(0, Math.max(0, keys.length - RUNTIME_LIMIT))
          .map(key => cache.delete(key)));
      } catch {
        // A cache write failure must not turn a successful asset request into an error.
      }
    }
    return response;
  } catch {
    return new Response('Local asset unavailable offline', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith(SCOPE_PATH) || request.headers.has('range')) return;
  if (request.mode === 'navigate') {
    event.respondWith(coreResponse(request, HOME));
    return;
  }
  if (CORE_URLS.has(url.href)) {
    event.respondWith(coreResponse(request, url.href));
    return;
  }
  const relativePath = url.pathname.slice(SCOPE_PATH.length);
  if (/^(assets\/(models|tex)\/|images\/)/.test(relativePath) &&
      /\.(gltf|glb|bin|jpe?g|png|webp|avif|gif|svg|ktx2|basis|hdr)$/i.test(url.pathname)) {
    event.respondWith(localAssetResponse(request, url));
  }
});
