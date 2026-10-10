import { describe, expect, it } from 'vitest';
import { mantraSchema, needSchema, type MantraData, type Need } from '../../src/lib/schema';
import { validateCatalog } from '../../src/lib/validate';

const needs: Need[] = [
  { id: 'sadness', label: 'Sadness', synonyms: ['sad'] },
  { id: 'focus', label: 'Focus', synonyms: [] },
];
const base: MantraData = mantraSchema.parse({
  name: 'Test', sanskrit: 'ॐ', needs: ['sadness'], summary: 'One line.',
});

describe('mantraSchema', () => {
  it('accepts minimal entry and defaults lists', () => {
    expect(base.translations).toEqual([]);
    expect(base.word_meanings).toEqual([]);
  });
  it('rejects missing sanskrit, empty needs, unknown keys', () => {
    expect(mantraSchema.safeParse({ name: 'x', needs: ['a'], summary: 's' }).success).toBe(false);
    expect(mantraSchema.safeParse({ name: 'x', sanskrit: 'ॐ', needs: [], summary: 's' }).success).toBe(false);
    expect(mantraSchema.safeParse({ ...base, devanagari: 'ॐ' }).success).toBe(false);
  });
});

describe('needSchema', () => {
  it('requires kebab-case id', () => {
    expect(needSchema.safeParse({ id: 'Fear Anxiety', label: 'x' }).success).toBe(false);
    expect(needSchema.parse({ id: 'fear', label: 'Fear' }).synonyms).toEqual([]);
  });
});

describe('validateCatalog', () => {
  it('returns [] for a valid catalog', () => {
    expect(validateCatalog({ mantras: [{ id: 'test', data: base }], needs, audioFiles: [] })).toEqual([]);
  });
  it('reports unknown needs, missing audio, bad ids, duplicate needs', () => {
    const bad: MantraData = { ...base, needs: ['sadness', 'joy'], audio: { file: 'nope.mp3' } };
    const errors = validateCatalog({
      mantras: [{ id: 'Bad_Id', data: bad }],
      needs: [...needs, { id: 'focus', label: 'Again', synonyms: [] }],
      audioFiles: ['other.mp3'],
    });
    expect(errors).toEqual([
      'needs.yaml: duplicate need id "focus"',
      'Bad_Id: id must be kebab-case (rename the file)',
      'Bad_Id: unknown need "joy" (add it to content/needs.yaml)',
      'Bad_Id: audio file "nope.mp3" not found in public/audio/',
    ]);
  });
});
