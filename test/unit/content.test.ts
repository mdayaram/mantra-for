import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { mantraSchema, needSchema } from '../../src/lib/schema';
import { buildSearchIndex } from '../../src/lib/search-index';
import { validateCatalog } from '../../src/lib/validate';

const root = join(import.meta.dirname, '../..');
const mantraDir = join(root, 'content/mantras');
const audioDir = join(root, 'public/audio');

function parseMarkdown(path: string) {
  const src = readFileSync(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!match) throw new Error(`${path}: missing frontmatter`);
  return { frontmatter: parse(match[1]), body: match[2] };
}

const files = readdirSync(mantraDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
const needs = (parse(readFileSync(join(root, 'content/needs.yaml'), 'utf8')) as unknown[]).map((n) => needSchema.parse(n));
const mantras = files.map((f) => {
  const { frontmatter, body } = parseMarkdown(join(mantraDir, f));
  const result = mantraSchema.safeParse(frontmatter);
  if (!result.success) throw new Error(`${f}: ${result.error.message}`);
  return { id: f.replace(/\.md$/, ''), data: result.data, body };
});

describe('content', () => {
  it('includes the seed mantras (and allows any number of others)', () => {
    expect(mantras.map((m) => m.id)).toEqual(expect.arrayContaining(['gayatri', 'pratah-smarana']));
  });

  it('passes catalog validation', () => {
    const audioFiles = existsSync(audioDir) ? readdirSync(audioDir) : [];
    expect(validateCatalog({ mantras, needs, audioFiles })).toEqual([]);
  });

  it('every mantra has How it helps and How to practice sections', () => {
    for (const m of mantras) {
      expect(m.body, m.id).toMatch(/^## How it helps$/m);
      expect(m.body, m.id).toMatch(/^## How to practice$/m);
    }
  });

  it('the template parses against the schema', () => {
    const { frontmatter } = parseMarkdown(join(mantraDir, '_template.md'));
    expect(mantraSchema.safeParse(frontmatter).success).toBe(true);
  });

  it('builds a search index', async () => {
    const index = await buildSearchIndex(mantras, needs);
    expect(index.mantras).toHaveLength(mantras.length);
  });
});
