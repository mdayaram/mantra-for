import { describe, expect, it } from 'vitest';
import { extractSection, firstLine, markdownToPlain, normalize, tokenize } from '../../src/lib/text';

describe('normalize', () => {
  it('strips IAST diacritics and lowercases', () => {
    expect(normalize('Gāyatrī Ṛgveda oṃ')).toBe('gayatri rgveda om');
  });
});

describe('tokenize', () => {
  it('splits, drops stopwords and 1-char tokens', () => {
    expect(tokenize("I'm feeling so SAD after the move")).toEqual(['sad', 'move']);
  });
  it('returns [] for punctuation or Devanagari only', () => {
    expect(tokenize('???')).toEqual([]);
    expect(tokenize('गायत्री')).toEqual([]);
  });
});

describe('extractSection', () => {
  const md = '## How it helps\nLine one.\n\nLine two.\n\n## How to practice\nDo it.\n';
  it('returns the section body up to the next heading', () => {
    expect(extractSection(md, 'How it helps')).toBe('Line one.\n\nLine two.');
  });
  it('is case-insensitive', () => {
    expect(extractSection(md, 'how TO practice')).toBe('Do it.');
  });
  it('returns empty string when absent', () => {
    expect(extractSection(md, 'Notes')).toBe('');
  });
});

describe('markdownToPlain', () => {
  it('strips links, emphasis and code markers', () => {
    expect(markdownToPlain('*dhiyo* [yo](http://x) `naḥ`\n\n**pra**')).toBe('dhiyo yo naḥ pra');
  });
});

describe('firstLine', () => {
  it('returns first non-empty trimmed line', () => {
    expect(firstLine('\n  ॐ भूर्भुवः स्वः\nतत्')).toBe('ॐ भूर्भुवः स्वः');
  });
});
