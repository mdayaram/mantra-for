import type { SearchIndex } from '../src/lib/search-index';
import { handleSearch } from './search';

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/search') return env.ASSETS.fetch(request);
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
    }
    return handleSearch(url, {
      async loadIndex() {
        const res = await env.ASSETS.fetch(new URL('/search-index.json', url));
        if (!res.ok) throw new Error(`search index unavailable: ${res.status}`);
        return res.json<SearchIndex>();
      },
      embedder: {
        async embed(texts) {
          const out = (await env.AI.run(EMBEDDING_MODEL, { text: texts })) as { data: number[][] };
          return out.data;
        },
      },
      cache: {
        get: (hash) => env.EMBEDDINGS.get<number[]>(`emb:${hash}`, 'json'),
        put: (hash, vector) => env.EMBEDDINGS.put(`emb:${hash}`, JSON.stringify(vector)),
      },
    });
  },
} satisfies ExportedHandler<Env>;
