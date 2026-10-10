import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/catalog';
import { buildSearchIndex } from '../lib/search-index';

export const GET: APIRoute = async () => {
  const { mantras, needs } = await getCatalog();
  const index = await buildSearchIndex(
    mantras.map((m) => ({ id: m.id, data: m.data, body: m.body ?? '' })),
    needs,
  );
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } });
};
