import type { MantraData, Need } from './schema';
import { extractSection, firstLine, markdownToPlain, normalize } from './text';

export interface IndexEntry {
  id: string;
  name: string;
  summary: string;
  needs: string[];
  firstLine: string;
  hasAudio: boolean;
  searchText: string;
  hash: string;
}

export interface SearchIndex {
  needs: Need[];
  mantras: IndexEntry[];
}

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildSearchIndex(
  mantras: { id: string; data: MantraData; body: string }[],
  needs: Need[],
): Promise<SearchIndex> {
  const labelOf = new Map(needs.map((n) => [n.id, n.label]));
  const entries = await Promise.all(
    mantras.map(async ({ id, data, body }) => {
      const searchText = [
        data.name,
        data.summary,
        data.needs.map((n) => labelOf.get(n) ?? n).join(', '),
        markdownToPlain(extractSection(body, 'How it helps')),
      ]
        .filter(Boolean)
        .join('\n');
      return {
        id,
        name: data.name,
        summary: data.summary,
        needs: data.needs,
        firstLine: firstLine(data.sanskrit),
        hasAudio: Boolean(data.audio),
        searchText,
        hash: await sha256Hex(searchText),
      };
    }),
  );
  entries.sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));
  return { needs, mantras: entries };
}
