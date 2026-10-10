import { MAX_RESULTS, type Scored } from './keyword';

export const SEMANTIC_THRESHOLD = 0.55;
export const KEYWORD_WEIGHT = 0.1;

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function blendRank(
  ids: string[],
  query: number[],
  vectors: Map<string, number[]>,
  keyword: Map<string, number>,
): Scored[] {
  const results: Scored[] = [];
  for (const id of ids) {
    const vec = vectors.get(id);
    const cos = vec ? cosine(query, vec) : 0;
    const kw = keyword.get(id) ?? 0;
    if (cos < SEMANTIC_THRESHOLD && kw <= 0) continue;
    results.push({ id, score: Math.round((cos + KEYWORD_WEIGHT * kw) * 10000) / 10000 });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}
