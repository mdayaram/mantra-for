/* Build substitutes the cache name and complete static inventory. */
const CACHE_NAME = __CACHE_NAME__;
const PRECACHE_URLS = __PRECACHE_URLS__;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Bound concurrent downloads; request complete audio files, never partial ranges.
      for (let i = 0; i < PRECACHE_URLS.length; i += 8) {
        await cache.addAll(PRECACHE_URLS.slice(i, i + 8).map((url) => new Request(url, { cache: 'reload' })));
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    // Updates wait for existing tabs to close, keeping pages and assets from one build.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('mantra-for-') && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function cachedResponse(request, url) {
  const cache = await caches.open(CACHE_NAME);
  // Queries don't change static pages; /?q= and /?need= work on an offline launch.
  let response = await cache.match(url.pathname);
  if (!response && request.mode === 'navigate' && !url.pathname.endsWith('/')) {
    response = await cache.match(`${url.pathname}/`);
  }
  if (response) {
    const range = request.headers.get('Range');
    if (!range) return response;
    // Mobile media players use single byte ranges for playback and seeking.
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return response;
    const body = await response.arrayBuffer();
    const size = body.byteLength;
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || end < start) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const headers = new Headers(response.headers);
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    headers.set('Accept-Ranges', 'bytes');
    headers.delete('Content-Encoding');
    return new Response(body.slice(start, end + 1), { status: 206, headers });
  }
  try {
    return await fetch(request);
  } catch {
    if (request.mode === 'navigate') return await cache.match('/404.html') ?? Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(cachedResponse(event.request, url));
});
