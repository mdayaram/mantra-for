import { describe, expect, it } from 'vitest';
import { mantraSchema, type Need } from '../../src/lib/schema';
import { buildSearchIndex, sha256Hex } from '../../src/lib/search-index';

const needs: Need[] = [
  { id: 'sadness', label: 'Sadness', synonyms: [] },
  { id: 'peace', label: 'Peace', synonyms: [] },
];
const m = (name: string, extra: object = {}) =>
  mantraSchema.parse({ name, sanskrit: '\nॐ शान्तिः\nदूसरी', needs: ['sadness', 'peace'], summary: 'Calms grief.', ...extra });

describe('buildSearchIndex', () => {
  it('builds entries with searchText from name, summary, need labels and How it helps', async () => {
    const index = await buildSearchIndex(
      [{ id: 'shanti', data: m('Śānti', { audio: { file: 'shanti.mp3' } }), body: '## How it helps\nIt *soothes*.\n\n## Notes\nGrammar.' }],
      needs,
    );
    const [e] = index.mantras;
    expect(e).toMatchObject({
      id: 'shanti', name: 'Śānti', summary: 'Calms grief.', needs: ['sadness', 'peace'],
      firstLine: 'ॐ शान्तिः', hasAudio: true,
      searchText: 'Śānti\nCalms grief.\nSadness, Peace\nIt soothes.',
    });
    expect(e.hash).toBe(await sha256Hex(e.searchText));
    expect(index.needs).toBe(needs);
  });

  it('handles a body without a How it helps section', async () => {
    const index = await buildSearchIndex([{ id: 'x', data: m('X'), body: 'Free-form meditation text.' }], needs);
    expect(index.mantras[0].searchText).toBe('X\nCalms grief.\nSadness, Peace');
    expect(index.mantras[0].hasAudio).toBe(false);
  });

  it('sorts by name ignoring diacritics and changes hash when text changes', async () => {
    const index = await buildSearchIndex(
      [
        { id: 'b', data: m('Bhaja'), body: '' },
        { id: 'a', data: m('Ātma'), body: '' },
      ],
      needs,
    );
    expect(index.mantras.map((e) => e.id)).toEqual(['a', 'b']);
    expect(index.mantras[0].hash).not.toBe(index.mantras[1].hash);
  });
});
