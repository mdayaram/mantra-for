import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/assets/search-index.json';
import type { SearchIndex } from '../../src/lib/search-index';
import { handleSearch, type Embedder, type SearchDeps, type VectorCache } from '../../worker/search';

const index = fixture as SearchIndex;

// Deterministic 3-d "embedding": grief-ish → x, clarity-ish → y, anything else → z.
function fakeVector(text: string): number[] {
  const t = text.toLowerCase();
  if (/sad|grief|loss/.test(t)) return [1, 0, 0];
  if (/clarity|confus|foggy/.test(t)) return [0, 1, 0];
  return [0, 0, 1];
}

function memoryCache(): VectorCache {
  const store = new Map<string, number[]>();
  return { get: async (h) => store.get(h) ?? null, put: async (h, v) => void store.set(h, v) };
}

function deps(overrides: Partial<SearchDeps> = {}): SearchDeps {
  const embedder: Embedder = { embed: vi.fn(async (texts: string[]) => texts.map(fakeVector)) };
  return { loadIndex: async () => index, embedder, cache: memoryCache(), ...overrides };
}

const call = (q: string | null, d: SearchDeps) =>
  handleSearch(new URL(q === null ? 'https://x/api/search' : `https://x/api/search?q=${encodeURIComponent(q)}`), d);

describe('handleSearch', () => {
  it('400s on missing, blank, or overlong q', async () => {
    for (const q of [null, '   ', 'x'.repeat(201)]) {
      const res = await call(q, deps());
      expect(res.status).toBe(400);
      expect(await res.json()).toHaveProperty('error');
    }
  });

  it('returns semantic results', async () => {
    // 'loss' → fake vector [1,0,0] = comfort's; no keyword hits, so score is pure cosine.
    const res = await call('heavy with loss', deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ mode: 'semantic', results: [{ id: 'comfort', score: 1 }] });
  });

  it('embeds only uncached mantras and caches new vectors', async () => {
    const d = deps();
    await call('foggy', d);
    expect(d.embedder.embed).toHaveBeenLastCalledWith(['foggy', index.mantras[0].searchText, index.mantras[1].searchText]);
    await call('foggy again', d);
    expect(d.embedder.embed).toHaveBeenLastCalledWith(['foggy again']);
  });

  it('falls back to keyword mode when the embedder throws', async () => {
    const res = await call('sad', deps({ embedder: { embed: async () => { throw new Error('AI down'); } } }));
    expect(await res.json()).toEqual({ mode: 'keyword', results: [{ id: 'comfort', score: 1 }] });
  });

  it('falls back to keyword mode on timeout', async () => {
    const hang: Embedder = { embed: () => new Promise(() => {}) };
    const res = await call('sad', deps({ embedder: hang, timeoutMs: 20 }));
    expect((await res.json()).mode).toBe('keyword');
  });

  it('falls back when the embedder returns the wrong number of vectors', async () => {
    const short: Embedder = { embed: async () => [[1, 0, 0]] };
    const res = await call('sad', deps({ embedder: short }));
    expect((await res.json()).mode).toBe('keyword');
  });

  it('still answers semantically when the cache read or write fails', async () => {
    const broken: VectorCache = {
      get: async () => { throw new Error('kv get'); },
      put: async () => { throw new Error('kv put'); },
    };
    const res = await call('confused', deps({ cache: broken }));
    expect(await res.json()).toEqual({ mode: 'semantic', results: [{ id: 'light', score: 1.1 }] });
  });

  it('returns 200 for stopword-only and Devanagari queries', async () => {
    for (const q of ['I feel...', 'गायत्री']) {
      const res = await call(q, deps());
      expect(res.status).toBe(200);
      expect((await res.json()).results).toEqual([]);
    }
  });
});
