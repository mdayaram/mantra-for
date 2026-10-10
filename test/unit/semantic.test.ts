import { describe, expect, it } from 'vitest';
import { blendRank, cosine } from '../../src/lib/semantic';

describe('cosine', () => {
  it('computes similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 1], [1, 0])).toBeCloseTo(0.7071, 4);
  });
  it('returns 0 for zero vectors or mismatched lengths', () => {
    expect(cosine([0, 0], [1, 0])).toBe(0);
    expect(cosine([1], [1, 0])).toBe(0);
  });
});

describe('blendRank', () => {
  const vectors = new Map([
    ['a', [1, 0]],
    ['b', [0.8, 0.6]],
    ['c', [0, 1]],
  ]);
  it('keeps items above threshold, sorted by blended score', () => {
    expect(blendRank(['a', 'b', 'c'], [1, 0], vectors, new Map())).toEqual([
      { id: 'a', score: 1 },
      { id: 'b', score: 0.8 },
    ]);
  });
  it('keeps below-threshold items with keyword hits and boosts them', () => {
    const result = blendRank(['a', 'b', 'c'], [1, 0], vectors, new Map([['c', 1], ['b', 3]]));
    expect(result).toEqual([
      { id: 'b', score: 1.1 },
      { id: 'a', score: 1 },
      { id: 'c', score: 0.1 },
    ]);
  });
  it('skips ids without vectors unless keyword matched', () => {
    expect(blendRank(['x'], [1, 0], vectors, new Map())).toEqual([]);
    expect(blendRank(['x'], [1, 0], vectors, new Map([['x', 1]]))).toEqual([{ id: 'x', score: 0.1 }]);
  });
});
