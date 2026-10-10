import { keywordRank, keywordScores, type Scored } from '../src/lib/keyword';
import type { SearchIndex } from '../src/lib/search-index';
import { blendRank } from '../src/lib/semantic';

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorCache {
  get(hash: string): Promise<number[] | null>;
  put(hash: string, vector: number[]): Promise<void>;
}

export interface SearchDeps {
  loadIndex(): Promise<SearchIndex>;
  embedder: Embedder;
  cache: VectorCache;
  timeoutMs?: number;
}

export type SearchResponse = { mode: 'semantic' | 'keyword'; results: Scored[] };

export const MAX_QUERY_LENGTH = 200;
export const DEFAULT_TIMEOUT_MS = 3000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

async function semanticRank(
  query: string,
  index: SearchIndex,
  deps: SearchDeps,
  keyword: Map<string, number>,
): Promise<Scored[]> {
  const cached = await Promise.all(index.mantras.map((m) => deps.cache.get(m.hash).catch(() => null)));
  const missing = index.mantras.filter((_, i) => !cached[i]);
  const vectors = await deps.embedder.embed([query, ...missing.map((m) => m.searchText)]);
  if (vectors.length !== missing.length + 1) {
    throw new Error(`embedder returned ${vectors.length} vectors, expected ${missing.length + 1}`);
  }
  const [queryVector, ...fresh] = vectors;
  const byId = new Map<string, number[]>();
  index.mantras.forEach((m, i) => {
    const vec = cached[i];
    if (vec) byId.set(m.id, vec);
  });
  missing.forEach((m, i) => byId.set(m.id, fresh[i]));
  await Promise.all(missing.map((m, i) => deps.cache.put(m.hash, fresh[i]).catch(() => {})));
  return blendRank(index.mantras.map((m) => m.id), queryVector, byId, keyword);
}

export async function handleSearch(url: URL, deps: SearchDeps): Promise<Response> {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return json({ error: 'Query parameter "q" is required.' }, 400);
  if (q.length > MAX_QUERY_LENGTH) return json({ error: `Query must be at most ${MAX_QUERY_LENGTH} characters.` }, 400);

  const index = await deps.loadIndex();
  const keyword = keywordScores(q, index);
  try {
    const results = await withTimeout(semanticRank(q, index, deps, keyword), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return json({ mode: 'semantic', results } satisfies SearchResponse);
  } catch (err) {
    console.error('semantic search failed, using keyword fallback', err);
    return json({ mode: 'keyword', results: keywordRank(q, index) } satisfies SearchResponse);
  }
}
