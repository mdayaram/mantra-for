import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const entries = new Map<string, Response>([
    ['/', new Response('home')],
    ['/m/gayatri/', new Response('mantra')],
    ['/audio/test.mp3', new Response('0123456789', { headers: { 'Content-Type': 'audio/mpeg' } })],
    ['/404.html', new Response('not found', { status: 404 })],
  ]);
  const cache = { match: vi.fn(async (path: string) => entries.get(path)?.clone()), addAll: vi.fn(async () => {}) };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => ['mantra-for-old', 'unrelated']), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async () => { throw new Error('offline'); });
  const claim = vi.fn(async () => {});
  runInNewContext(readFileSync('scripts/service-worker.js', 'utf8')
    .replace('__CACHE_NAME__', '"mantra-for-test"')
    .replace('__PRECACHE_URLS__', '["https://example.com/", "https://example.com/audio/test.mp3"]'), {
    self: { location: { origin: 'https://example.com' }, clients: { claim }, addEventListener: (name: string, cb: any) => { listeners[name] = cb; } },
    caches, fetch, Request, Response, Headers, URL,
  });
  async function request(path: string, headers = {}, navigate = false) {
    let response: Promise<Response> | undefined;
    const req = new Request(`https://example.com${path}`, { headers });
    if (navigate) Object.defineProperty(req, 'mode', { value: 'navigate' });
    listeners.fetch({ request: req, respondWith: (value: Promise<Response>) => { response = value; } });
    return response;
  }
  return { listeners, cache, caches, fetch, claim, request };
}

describe('offline service worker', () => {
  it('serves query URLs and unvisited pages from the snapshot', async () => {
    const sw = worker();
    expect(await (await sw.request('/?q=peace'))!.text()).toBe('home');
    expect(await (await sw.request('/m/gayatri', {}, true))!.text()).toBe('mantra');
    expect(sw.fetch).not.toHaveBeenCalled();
  });
  it('serves audio ranges, suffixes and invalid ranges', async () => {
    const sw = worker();
    const response = (await sw.request('/audio/test.mp3', { Range: 'bytes=2-5' }))!;
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
    expect(await (await sw.request('/audio/test.mp3', { Range: 'bytes=-3' }))!.text()).toBe('789');
    expect((await sw.request('/audio/test.mp3', { Range: 'bytes=20-' }))!.status).toBe(416);
  });
  it('leaves API requests uncached and returns an offline 404 for unknown pages', async () => {
    const sw = worker();
    expect(await sw.request('/api/search?q=peace')).toBeUndefined();
    expect((await sw.request('/unknown/', {}, true))!.status).toBe(404);
  });
  it('claims clients and deletes only previous app caches on activation', async () => {
    const sw = worker();
    let done: Promise<void>;
    sw.listeners.activate({ waitUntil: (promise: Promise<void>) => { done = promise; } });
    await done!;
    expect(sw.caches.delete).toHaveBeenCalledExactlyOnceWith('mantra-for-old');
    expect(sw.claim).toHaveBeenCalledOnce();
  });
  it('discards an incomplete install without deleting the previous snapshot', async () => {
    const sw = worker();
    sw.cache.addAll.mockRejectedValueOnce(new Error('quota'));
    let done: Promise<void>;
    sw.listeners.install({ waitUntil: (promise: Promise<void>) => { done = promise; } });
    await expect(done!).rejects.toThrow('quota');
    expect(sw.caches.delete).toHaveBeenCalledExactlyOnceWith('mantra-for-test');
  });
});
