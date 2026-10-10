import type { Need } from './schema';
import type { SearchIndex } from './search-index';
import { tokenize } from './text';

export interface Scored {
  id: string;
  score: number;
}

export const MAX_RESULTS = 10;
const NEED_WEIGHT = 1;
const TEXT_WEIGHT = 0.2;

function termMatches(token: string, term: string): boolean {
  if (token === term) return true;
  return token.length >= 4 && term.length >= 4 && (token.startsWith(term) || term.startsWith(token));
}

export function matchNeeds(query: string, needs: Need[]): Set<string> {
  const tokens = tokenize(query);
  const matched = new Set<string>();
  for (const need of needs) {
    const terms = [...need.id.split('-'), ...tokenize(need.label), ...need.synonyms.flatMap(tokenize)];
    if (tokens.some((t) => terms.some((term) => termMatches(t, term)))) matched.add(need.id);
  }
  return matched;
}

export function keywordScores(query: string, index: SearchIndex): Map<string, number> {
  const tokens = tokenize(query);
  const matched = matchNeeds(query, index.needs);
  const scores = new Map<string, number>();
  for (const m of index.mantras) {
    const words = new Set(tokenize(m.searchText));
    const needHits = m.needs.filter((n) => matched.has(n)).length;
    const textHits = tokens.filter((t) => words.has(t)).length;
    const score = Math.round((needHits * NEED_WEIGHT + textHits * TEXT_WEIGHT) * 1000) / 1000;
    if (score > 0) scores.set(m.id, score);
  }
  return scores;
}

export function keywordRank(query: string, index: SearchIndex, limit = MAX_RESULTS): Scored[] {
  return [...keywordScores(query, index)]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
