import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import { readNeedsFile } from './needs-file';
import type { Need } from './schema';
import { normalize } from './text';
import { validateCatalog } from './validate';

export interface Catalog {
  mantras: CollectionEntry<'mantras'>[];
  needs: Need[];
  usedNeeds: Need[];
  needById: Map<string, Need>;
}

let cached: Promise<Catalog> | undefined;

export function getCatalog(): Promise<Catalog> {
  cached ??= loadCatalog();
  return cached;
}

async function loadCatalog(): Promise<Catalog> {
  const [mantras, needEntries] = await Promise.all([getCollection('mantras'), getCollection('needs')]);
  const needs = needEntries.map((e) => e.data);
  const audioDir = join(process.cwd(), 'public', 'audio');
  const audioFiles = existsSync(audioDir) ? readdirSync(audioDir) : [];
  const errors = validateCatalog({
    mantras: mantras.map((m) => ({ id: m.id, data: m.data })),
    needs: readNeedsFile(join(process.cwd(), 'content', 'needs.yaml')),
    audioFiles,
  });
  if (errors.length > 0) throw new Error(`Invalid content:\n- ${errors.join('\n- ')}`);
  const sorted = [...mantras].sort((a, b) => normalize(a.data.name).localeCompare(normalize(b.data.name)));
  return {
    mantras: sorted,
    needs,
    usedNeeds: needs.filter((n) => mantras.some((m) => m.data.needs.includes(n.id))),
    needById: new Map(needs.map((n) => [n.id, n])),
  };
}
