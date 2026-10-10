import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';

function fakeVector(text: string): number[] {
  const t = text.toLowerCase();
  if (/sad|grief|loss/.test(t)) return [1, 0, 0];
  if (/clarity|confus|foggy/.test(t)) return [0, 1, 0];
  return [0, 0, 1];
}

function fakeAI(calls: string[][] = []) {
  return {
    run: async (_model: string, input: { text: string[] }) => {
      calls.push(input.text);
      return { shape: [input.text.length, 3], data: input.text.map(fakeVector) };
    },
  };
}

const failingAI = { run: async () => { throw new Error('AI unavailable'); } };

async function fetchWith(path: string, ai: unknown, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const testEnv = { ...(env as object), AI: ai } as unknown as Env;
  const res = await worker.fetch(new Request(`https://example.com${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('worker /api/search', () => {
  it('returns semantic results and caches embeddings in KV', async () => {
    const calls: string[][] = [];
    const res = await fetchWith('/api/search?q=heavy%20with%20loss', fakeAI(calls));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'semantic', results: [{ id: 'comfort', score: 1 }] });
    expect(calls[0]).toHaveLength(3);
    expect(await (env as unknown as Env).EMBEDDINGS.get('emb:hash-comfort', 'json')).toEqual([1, 0, 0]);

    await fetchWith('/api/search?q=foggy', fakeAI(calls));
    expect(calls[1]).toEqual(['foggy']);
  });

  it('falls back to keyword results when AI fails', async () => {
    const res = await fetchWith('/api/search?q=sad', failingAI);
    expect(await res.json()).toEqual({ mode: 'keyword', results: [{ id: 'comfort', score: 1 }] });
  });

  it('400s on empty query and 405s on POST', async () => {
    expect((await fetchWith('/api/search?q=', fakeAI())).status).toBe(400);
    const post = await fetchWith('/api/search?q=sad', fakeAI(), { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET');
  });

  it('serves static assets for other paths', async () => {
    const res = await fetchWith('/search-index.json', fakeAI());
    expect(res.status).toBe(200);
    expect((await res.json()).mantras).toHaveLength(2);
  });
});

describe('worker module', () => {
  it('exports only the default handler (workerd treats named exports as entrypoints)', async () => {
    const mod = await import('../../worker/index');
    expect(Object.keys(mod)).toEqual(['default']);
  });
});
