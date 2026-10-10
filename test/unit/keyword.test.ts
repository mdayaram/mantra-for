import { describe, expect, it } from 'vitest';
import { keywordRank, keywordScores, matchNeeds } from '../../src/lib/keyword';
import type { SearchIndex } from '../../src/lib/search-index';

const index: SearchIndex = {
  needs: [
    { id: 'sadness', label: 'Sadness', synonyms: ['sad', 'grief'] },
    { id: 'fear', label: 'Fear & Anxiety', synonyms: ['anxious', 'worry'] },
    { id: 'morning', label: 'Morning practice', synonyms: ['dawn'] },
  ],
  mantras: [
    { id: 'gayatri', name: 'Gāyatrī Mantra', summary: 'Illumined understanding.', needs: ['morning'], firstLine: 'ॐ', hasAudio: true, searchText: 'Gāyatrī Mantra\nIllumined understanding.\nMorning practice\nThe sun rises.', hash: 'h1' },
    { id: 'shanti', name: 'Śānti', summary: 'Peace in grief.', needs: ['sadness', 'fear'], firstLine: 'ॐ', hasAudio: false, searchText: 'Śānti\nPeace in grief.\nSadness, Fear & Anxiety\nComfort.', hash: 'h2' },
  ],
};

describe('matchNeeds', () => {
  it('matches ids, label words, synonyms and prefixes', () => {
    expect(matchNeeds('so sad', index.needs)).toEqual(new Set(['sadness']));
    expect(matchNeeds('ANXIETY', index.needs)).toEqual(new Set(['fear']));
    expect(matchNeeds('worrying about work', index.needs)).toEqual(new Set(['fear']));
    expect(matchNeeds('at dawn', index.needs)).toEqual(new Set(['morning']));
  });
});

describe('keywordRank', () => {
  it('ranks need matches first', () => {
    // 'sad' matches need `sadness` (+1); text matching is exact-token, and shanti's text has 'sadness' not 'sad'.
    expect(keywordRank('I feel sad', index)).toEqual([{ id: 'shanti', score: 1 }]);
  });
  it('matches names diacritic-insensitively', () => {
    expect(keywordRank('GAYATRI', index).map((r) => r.id)).toEqual(['gayatri']);
    expect(keywordRank('gāyatrī', index).map((r) => r.id)).toEqual(['gayatri']);
  });
  it('returns [] for stopword-only, punctuation-only and Devanagari queries', () => {
    expect(keywordRank('I feel...', index)).toEqual([]);
    expect(keywordRank('???', index)).toEqual([]);
    expect(keywordRank('गायत्री', index)).toEqual([]);
  });
  it('respects limit', () => {
    expect(keywordRank('mantra peace', index, 1)).toHaveLength(1);
  });
});

describe('keywordScores', () => {
  it('omits zero scores', () => {
    expect([...keywordScores('sad', index).keys()]).toEqual(['shanti']);
  });
});
