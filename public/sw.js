const SW_VERSION = '__WONXR_SW_VERSION__';
const CACHE_PREFIX = 'wonxr';
const CACHE_NAME = `${CACHE_PREFIX}-${SW_VERSION}`;
const APP_SCOPE = '/WonXR/';
const APP_SHELL = [
  '/WonXR/manifest.webmanifest',
  '/WonXR/favicon.ico',
  '/WonXR/icons/icon-192.png',
  '/WonXR/icons/icon-512.png',
  '/WonXR/icons/apple-touch-icon.png',
];

function isWonxrCache(name) {
  return name.toLowerCase().includes('wonxr') || name.includes('WonXR');
}

async function cacheSafeAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    APP_SHELL.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch {
        // Precache is opportunistic. Runtime navigation remains network-first.
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheSafeAssets());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => isWonxrCache(key) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: 'WONXR_SW_ACTIVE', version: SW_VERSION, cacheName: CACHE_NAME });
          }
        }),
      ),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    return (
      (await caches.match('/WonXR/?mode=main')) ||
      (await caches.match('/WonXR/index.html')) ||
      new Response('WonXR is offline and no cached shell is available.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_SCOPE)) {
    return;
  }

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (
    url.pathname.endsWith('.mind') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('.json')
  ) {
    event.respondWith(networkFirst(request));
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
