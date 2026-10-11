# Mantra Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static Astro site of mantras, served by a Cloudflare Worker that adds a semantic `/api/search` endpoint (Workers AI embeddings cached in KV) with keyword fallback.

**Architecture:** Mantras are Markdown files with validated YAML frontmatter in `content/`. Astro builds static pages plus `/search-index.json`. One Worker (static assets + `run_worker_first: ["/api/*"]`) answers `/api/search` by embedding the query and any un-cached mantra texts, blending cosine similarity with a shared keyword ranker; any AI failure falls back to keyword results. The browser reorders server-rendered cards by the returned ids and runs the same keyword ranker locally if the API is unreachable.

**Tech Stack:** Astro (static output), Cloudflare Workers + Static Assets, Workers AI (`@cf/baai/bge-base-en-v1.5`), Workers KV, Vitest + `@cloudflare/vitest-plugin`, `yaml` (tests only), Fontsource fonts.

**Spec:** `docs/superpowers/specs/2026-10-10-mantra-repository-design.md`

## Global Constraints

- **Latest versions of every library**, installed with `@latest` and verified with `npm outdated`. Sole exception: `typescript` is pinned to the newest **6.x** because `@astrojs/check` peers on `typescript ^5 || ^6`. Record this in the README.
- Node ≥ 22.12 (Astro engine floor). `package.json` has `"type": "module"`.
- Mantra id = filename without `.md`, kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`). Files starting with `_` are ignored.
- Required mantra fields: `name`, `sanskrit`, `needs` (≥1), `summary`. Everything else optional.
- Need ids must exist in `content/needs.yaml`; `audio.file` must exist in `public/audio/`.
- `searchText` = name + summary + need labels + plain text of the `## How it helps` section.
- `/api/search?q=` — `q` trimmed, non-empty, ≤ 200 chars, else 400. Top 10 results. AI timeout 3000 ms.
- Embedding model: `@cf/baai/bge-base-en-v1.5`. KV key: `emb:<hash>`, no TTL.
- Tests must never call real Workers AI (it bills even locally) — always inject a fake.
- Pages work without JavaScript; JS only enhances home search.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on branch `mantra-repository`.

## Review Focus

1. **Query of only stopwords/punctuation** (`"I feel..."`, `"???"`) — must return 200 with whatever semantic finds, never crash on an empty token list. Pinned in Task 4 and Task 6.
2. **Devanagari query** (`"गायत्री"`) — keyword tokenizer yields nothing; search must still return 200 (semantic path). Pinned in Task 4 and Task 6.
3. **Mantra without a `## How it helps` heading** (a meditation structured differently) — index must still build, `searchText` falls back to name/summary/labels. Pinned in Task 3.
4. **Malformed AI response** (fewer vectors than texts) — must fall back to keyword mode, not 500 or mis-assign vectors. Pinned in Task 6.
5. **Odd URL state** (`/?q=` empty, `/?need=unknown`) — home shows all mantras / an empty-state message, not a broken page. Pinned in Task 10.

---

## File map

| File | Responsibility |
|---|---|
| `package.json`, `astro.config.ts`, `tsconfig.json`, `worker/tsconfig.json`, `wrangler.jsonc`, `vitest.config.ts`, `vitest.worker.config.ts`, `.gitignore` | Tooling |
| `src/lib/text.ts` | `normalize`, `tokenize`, `extractSection`, `markdownToPlain`, `firstLine` |
| `src/lib/schema.ts` | Zod schemas + types for mantra frontmatter and needs |
| `src/lib/validate.ts` | Cross-file checks (need refs, audio files, duplicate needs) |
| `src/lib/search-index.ts` | `SearchIndex` types + `buildSearchIndex` |
| `src/lib/keyword.ts` | Keyword ranker (shared by Worker and browser) |
| `src/lib/semantic.ts` | `cosine`, `blendRank` |
| `src/lib/url-state.ts` | `parseState` for home page URL |
| `src/lib/rehype-collapsible.ts` | Wraps `## Notes` sections in `<details>` |
| `src/lib/catalog.ts` | Loads collections, validates, sorts (Astro-only) |
| `src/content.config.ts` | Astro collections |
| `worker/search.ts` | `handleSearch` (pure, dependency-injected) |
| `worker/index.ts` | Worker entry: wires AI/KV/ASSETS into `handleSearch` |
| `src/layouts/Base.astro`, `src/styles/global.css` | Shell + design tokens |
| `src/components/MantraCard.astro`, `src/components/NeedChips.astro` | UI pieces |
| `src/pages/index.astro`, `src/pages/m/[id].astro`, `src/pages/need/[id].astro`, `src/pages/404.astro`, `src/pages/search-index.json.ts` | Routes |
| `src/scripts/home.ts` | Client search enhancement |
| `content/needs.yaml`, `content/mantras/*.md`, `public/audio/*.mp3` | Content |
| `docs/adding-a-mantra.md`, `content/mantras/_template.md` | Authoring |
| `test/unit/*.test.ts`, `test/worker/*.test.ts`, `test/worker/wrangler.test.jsonc`, `test/fixtures/assets/search-index.json` | Tests |

---

### Task 1: Scaffold project and text utilities

**Files:**
- Create: `package.json`, `astro.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/pages/index.astro` (placeholder), `src/lib/text.ts`
- Test: `test/unit/text.test.ts`

**Interfaces:**
- Produces:
  - `normalize(s: string): string` — NFD, strip combining marks, lowercase.
  - `tokenize(s: string): string[]` — normalized `[a-z0-9]+` tokens, length ≥ 2, stopwords removed.
  - `extractSection(markdown: string, heading: string): string` — body of the `## <heading>` section (case-insensitive), `''` if absent.
  - `markdownToPlain(md: string): string`
  - `firstLine(s: string): string`

- [ ] **Step 1: Create package.json and install latest deps**

```json
{
  "name": "mantra-for",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro build && wrangler dev",
    "check": "astro check && tsc -p worker/tsconfig.json",
    "test": "vitest run",
    "cf-typegen": "wrangler types",
    "deploy": "astro build && wrangler deploy"
  }
}
```

Run:
```bash
npm install astro@latest @fontsource/noto-serif-devanagari@latest @fontsource/eb-garamond@latest
npm install -D wrangler@latest vitest@latest @cloudflare/vitest-plugin@latest @astrojs/check@latest yaml@latest typescript@6
npm outdated
```
Expected: `npm outdated` lists only `typescript` (wanted 6.x, latest 7.x). If anything else is listed, `npm install <pkg>@latest` it. If `@cloudflare/vitest-plugin`'s peer range no longer admits the installed `vitest`, install the newest `vitest` it admits and note it in the README.

- [ ] **Step 2: Create config files**

`astro.config.ts`:
```ts
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  build: { format: 'directory' },
});
```

`tsconfig.json`:
```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "astro.config.ts", "src", "test/unit"],
  "exclude": ["dist", "worker", "test/worker"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' } },
    ],
  },
});
```

`.gitignore`:
```
node_modules/
dist/
.astro/
.wrangler/
.dev.vars
```

`src/pages/index.astro` (placeholder, replaced in Task 10):
```astro
<h1>Mantra For</h1>
```

- [ ] **Step 3: Write the failing test** — `test/unit/text.test.ts`

```ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run test/unit/text.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/text`.

- [ ] **Step 5: Implement** — `src/lib/text.ts`

```ts
const STOPWORDS = new Set([
  'a', 'about', 'after', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'but', 'by',
  'can', 'cant', 'do', 'dont', 'feel', 'feeling', 'feels', 'for', 'from', 'get', 'have', 'help',
  'i', 'im', 'in', 'is', 'it', 'its', 'just', 'like', 'me', 'mantra', 'mantras', 'my', 'need',
  'of', 'on', 'or', 'really', 'so', 'some', 'something', 'that', 'the', 'this', 'to', 'too',
  'very', 'want', 'was', 'when', 'with', 'you',
]);

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function extractSection(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const want = heading.trim().toLowerCase();
  const start = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').trim().toLowerCase() === want);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,2}\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

export function markdownToPlain(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstLine(s: string): string {
  return s.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}
```

- [ ] **Step 6: Run tests and build**

Run: `npx vitest run test/unit/text.test.ts && npm run build`
Expected: tests PASS; build writes `dist/index.html`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json astro.config.ts tsconfig.json vitest.config.ts .gitignore src test
git commit -m "Scaffold Astro project and text utilities"
```

---

### Task 2: Schemas, validation, needs vocabulary

**Files:**
- Create: `src/lib/schema.ts`, `src/lib/validate.ts`, `content/needs.yaml`
- Test: `test/unit/validate.test.ts`

**Interfaces:**
- Produces:
  - `needSchema`, `mantraSchema` (Zod, from `astro/zod`); types `Need = { id: string; label: string; synonyms: string[] }`, `MantraData` (fields per spec; `translations` and `word_meanings` default `[]`).
  - `validateCatalog(input: { mantras: { id: string; data: MantraData }[]; needs: Need[]; audioFiles: string[] }): string[]` — list of human-readable errors, `[]` when valid.

- [ ] **Step 1: Write the failing test** — `test/unit/validate.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/validate.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/schema`.

- [ ] **Step 3: Implement** — `src/lib/schema.ts`

```ts
import { z } from 'astro/zod';

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const needSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  label: z.string().min(1),
  synonyms: z.array(z.string()).default([]),
});

export const mantraSchema = z.strictObject({
  name: z.string().min(1),
  sanskrit: z.string().trim().min(1),
  transliteration: z.string().optional(),
  translations: z.array(z.object({ label: z.string(), text: z.string() })).default([]),
  word_meanings: z
    .array(z.object({ sanskrit: z.string(), iast: z.string(), meaning: z.string() }))
    .default([]),
  source: z.string().optional(),
  needs: z.array(z.string()).min(1),
  summary: z.string().min(1),
  audio: z
    .object({
      file: z.string(),
      credit: z.string().optional(),
      url: z.url().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export type Need = z.infer<typeof needSchema>;
export type MantraData = z.infer<typeof mantraSchema>;
```

`src/lib/validate.ts`:
```ts
import { ID_PATTERN, type MantraData, type Need } from './schema';

export interface CatalogInput {
  mantras: { id: string; data: MantraData }[];
  needs: Need[];
  audioFiles: string[];
}

export function validateCatalog({ mantras, needs, audioFiles }: CatalogInput): string[] {
  const errors: string[] = [];
  const needIds = new Set<string>();
  for (const need of needs) {
    if (needIds.has(need.id)) errors.push(`needs.yaml: duplicate need id "${need.id}"`);
    needIds.add(need.id);
  }
  const audio = new Set(audioFiles);
  for (const { id, data } of mantras) {
    if (!ID_PATTERN.test(id)) errors.push(`${id}: id must be kebab-case (rename the file)`);
    for (const n of data.needs) {
      if (!needIds.has(n)) errors.push(`${id}: unknown need "${n}" (add it to content/needs.yaml)`);
    }
    if (data.audio && !audio.has(data.audio.file)) {
      errors.push(`${id}: audio file "${data.audio.file}" not found in public/audio/`);
    }
  }
  return errors;
}
```

`content/needs.yaml`:
```yaml
- id: sadness
  label: Sadness
  synonyms: [sad, grief, grieving, sorrow, sorrowful, despondent, down, depressed, loss, mourning, heartbroken, lonely, hopeless]
- id: fear
  label: Fear & Anxiety
  synonyms: [afraid, scared, fear, anxious, anxiety, worry, worried, panic, dread, nervous, overwhelmed, insecure]
- id: anger
  label: Anger
  synonyms: [angry, rage, irritated, frustrated, resentment, annoyed, furious]
- id: focus
  label: Focus
  synonyms: [concentrate, concentration, distracted, scattered, study, studying, work, attention]
- id: clarity
  label: Clarity
  synonyms: [confused, confusion, foggy, unclear, decision, lost, understanding, wisdom, insight, stuck]
- id: gratitude
  label: Gratitude
  synonyms: [grateful, thankful, thanks, appreciation, blessed]
- id: peace
  label: Peace
  synonyms: [calm, peaceful, stillness, restless, agitated, stress, stressed, tranquil, serenity, equanimity]
- id: protection
  label: Protection
  synonyms: [safe, safety, protect, danger, travel, obstacles, harm]
- id: morning
  label: Morning practice
  synonyms: [dawn, sunrise, waking, wake, morning, start, day]
- id: healing
  label: Healing
  synonyms: [sick, illness, ill, health, healing, recovery, pain, surgery]
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/unit/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema.ts src/lib/validate.ts content/needs.yaml test/unit/validate.test.ts
git commit -m "Add content schemas, catalog validation, and needs vocabulary"
```

---

### Task 3: Search index builder

**Files:**
- Create: `src/lib/search-index.ts`
- Test: `test/unit/search-index.test.ts`

**Interfaces:**
- Consumes: `Need`, `MantraData` (Task 2); `extractSection`, `markdownToPlain`, `firstLine`, `normalize` (Task 1).
- Produces:
  ```ts
  interface IndexEntry { id: string; name: string; summary: string; needs: string[]; firstLine: string; hasAudio: boolean; searchText: string; hash: string }
  interface SearchIndex { needs: Need[]; mantras: IndexEntry[] }
  function sha256Hex(s: string): Promise<string>
  function buildSearchIndex(mantras: { id: string; data: MantraData; body: string }[], needs: Need[]): Promise<SearchIndex>
  ```
  `mantras` in the index are sorted by `normalize(name)`.

- [ ] **Step 1: Write the failing test** — `test/unit/search-index.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/search-index.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement** — `src/lib/search-index.ts`

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/unit/search-index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search-index.ts test/unit/search-index.test.ts
git commit -m "Add search index builder"
```

---

### Task 4: Keyword ranker

**Files:**
- Create: `src/lib/keyword.ts`
- Test: `test/unit/keyword.test.ts`

**Interfaces:**
- Consumes: `SearchIndex` (Task 3), `tokenize`, `normalize` (Task 1), `Need` (Task 2).
- Produces:
  ```ts
  interface Scored { id: string; score: number }
  const MAX_RESULTS = 10
  function matchNeeds(query: string, needs: Need[]): Set<string>
  function keywordScores(query: string, index: SearchIndex): Map<string, number>  // only ids with score > 0
  function keywordRank(query: string, index: SearchIndex, limit?: number): Scored[] // desc, ties keep index order
  ```
  Scoring: `1.0 × (mantra needs matched by query) + 0.2 × (query tokens present in mantra's searchText tokens)`. A token matches a need term when equal, or both are ≥ 4 chars and one is a prefix of the other.

- [ ] **Step 1: Write the failing test** — `test/unit/keyword.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/keyword.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement** — `src/lib/keyword.ts`

```ts
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
```

(`Array.prototype.sort` is stable, so ties keep index order because `keywordScores` iterates `index.mantras` in order.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/unit/keyword.test.ts`
Expected: PASS. If `matchNeeds('so sad')` also matches `sadness` via the id prefix rule that's expected; if any assertion fails because of an unexpected extra need match, fix the fixture expectation only if the match is reasonable, otherwise fix the code.

- [ ] **Step 5: Commit**

```bash
git add src/lib/keyword.ts test/unit/keyword.test.ts
git commit -m "Add shared keyword ranker"
```

---

### Task 5: Semantic blending

**Files:**
- Create: `src/lib/semantic.ts`
- Test: `test/unit/semantic.test.ts`

**Interfaces:**
- Consumes: `Scored`, `MAX_RESULTS` (Task 4).
- Produces:
  ```ts
  const SEMANTIC_THRESHOLD = 0.55
  const KEYWORD_WEIGHT = 0.1
  function cosine(a: number[], b: number[]): number   // 0 if either is zero-length/zero-norm
  function blendRank(ids: string[], query: number[], vectors: Map<string, number[]>, keyword: Map<string, number>): Scored[]
  ```
  Include id if `cosine ≥ SEMANTIC_THRESHOLD` or keyword score > 0. Score = `cosine + KEYWORD_WEIGHT × keyword`. Sorted desc, top `MAX_RESULTS`. Score rounded to 4 dp.

- [ ] **Step 1: Write the failing test** — `test/unit/semantic.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/semantic.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement** — `src/lib/semantic.ts`

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/unit/semantic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/semantic.ts test/unit/semantic.test.ts
git commit -m "Add cosine ranking blended with keyword scores"
```

---

### Task 6: Search handler (dependency-injected)

**Files:**
- Create: `worker/search.ts`, `test/fixtures/assets/search-index.json`
- Test: `test/unit/search-handler.test.ts`

**Interfaces:**
- Consumes: `SearchIndex` (Task 3), `keywordScores`, `keywordRank`, `Scored` (Task 4), `blendRank` (Task 5).
- Produces:
  ```ts
  interface Embedder { embed(texts: string[]): Promise<number[][]> }
  interface VectorCache { get(hash: string): Promise<number[] | null>; put(hash: string, vector: number[]): Promise<void> }
  interface SearchDeps { loadIndex(): Promise<SearchIndex>; embedder: Embedder; cache: VectorCache; timeoutMs?: number }
  type SearchResponse = { mode: 'semantic' | 'keyword'; results: Scored[] }
  const MAX_QUERY_LENGTH = 200
  const DEFAULT_TIMEOUT_MS = 3000
  function handleSearch(url: URL, deps: SearchDeps): Promise<Response>
  ```
  400 body: `{ "error": "<message>" }`. Success body: `SearchResponse`, `Content-Type: application/json`, `Cache-Control: no-store`.

- [ ] **Step 1: Create the fixture** — `test/fixtures/assets/search-index.json`

```json
{
  "needs": [
    { "id": "sadness", "label": "Sadness", "synonyms": ["sad", "grief"] },
    { "id": "clarity", "label": "Clarity", "synonyms": ["confused"] }
  ],
  "mantras": [
    { "id": "comfort", "name": "Comfort Mantra", "summary": "For grief.", "needs": ["sadness"], "firstLine": "ॐ", "hasAudio": false, "searchText": "Comfort Mantra\nFor grief.\nSadness", "hash": "hash-comfort" },
    { "id": "light", "name": "Light Mantra", "summary": "For clarity.", "needs": ["clarity"], "firstLine": "ॐ", "hasAudio": true, "searchText": "Light Mantra\nFor clarity.\nClarity", "hash": "hash-light" }
  ]
}
```

- [ ] **Step 2: Write the failing test** — `test/unit/search-handler.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/assets/search-index.json';
import type { SearchIndex } from '../../src/lib/search-index';
import { handleSearch, type Embedder, type SearchDeps, type VectorCache } from '../../worker/search';

const index = fixture as SearchIndex;

// Deterministic 3-d "embedding": grief-ish → x, clarity-ish → y, anything else → z.
export function fakeVector(text: string): number[] {
  const t = text.toLowerCase();
  if (/sad|grief|loss/.test(t)) return [1, 0, 0];
  if (/clarity|confus|foggy/.test(t)) return [0, 1, 0];
  return [0, 0, 1];
}

function memoryCache(): VectorCache & { store: Map<string, number[]> } {
  const store = new Map<string, number[]>();
  return { store, get: async (h) => store.get(h) ?? null, put: async (h, v) => void store.set(h, v) };
}

function deps(overrides: Partial<SearchDeps> = {}): SearchDeps {
  const embedder: Embedder = { embed: vi.fn(async (texts: string[]) => texts.map(fakeVector)) };
  return { loadIndex: async () => index, embedder, cache: memoryCache(), ...overrides };
}

const call = (q: string | null, d: SearchDeps) =>
  handleSearch(new URL(q === null ? 'https://x/api/search' : `https://x/api/search?q=${encodeURIComponent(q)}`), d);

describe('handleSearch', () => {
  it('400s on missing, blank, or overlong q', async () => {
    for (const q of [null, '   ', 'x'.repeat(201)]) {
      const res = await call(q, deps());
      expect(res.status).toBe(400);
      expect(await res.json()).toHaveProperty('error');
    }
  });

  it('returns semantic results', async () => {
    // 'loss' → fake vector [1,0,0] = comfort's; no keyword hits, so score is pure cosine.
    const res = await call('heavy with loss', deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ mode: 'semantic', results: [{ id: 'comfort', score: 1 }] });
  });

  it('embeds only uncached mantras and caches new vectors', async () => {
    const d = deps();
    await call('foggy', d);
    expect(d.embedder.embed).toHaveBeenLastCalledWith(['foggy', index.mantras[0].searchText, index.mantras[1].searchText]);
    await call('foggy again', d);
    expect(d.embedder.embed).toHaveBeenLastCalledWith(['foggy again']);
  });

  it('falls back to keyword mode when the embedder throws', async () => {
    const res = await call('sad', deps({ embedder: { embed: async () => { throw new Error('AI down'); } } }));
    expect(await res.json()).toEqual({ mode: 'keyword', results: [{ id: 'comfort', score: 1 }] });
  });

  it('falls back to keyword mode on timeout', async () => {
    const hang: Embedder = { embed: () => new Promise(() => {}) };
    const res = await call('sad', deps({ embedder: hang, timeoutMs: 20 }));
    expect((await res.json()).mode).toBe('keyword');
  });

  it('falls back when the embedder returns the wrong number of vectors', async () => {
    const short: Embedder = { embed: async () => [[1, 0, 0]] };
    const res = await call('sad', deps({ embedder: short }));
    expect((await res.json()).mode).toBe('keyword');
  });

  it('still answers semantically when the cache read or write fails', async () => {
    const broken: VectorCache = {
      get: async () => { throw new Error('kv get'); },
      put: async () => { throw new Error('kv put'); },
    };
    const res = await call('confused', deps({ cache: broken }));
    expect(await res.json()).toEqual({ mode: 'semantic', results: [{ id: 'light', score: 1.1 }] });
  });

  it('returns 200 for stopword-only and Devanagari queries', async () => {
    for (const q of ['I feel...', 'गायत्री']) {
      const res = await call(q, deps());
      expect(res.status).toBe(200);
      expect((await res.json()).results).toEqual([]);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/unit/search-handler.test.ts`
Expected: FAIL — cannot resolve `../../worker/search`.

- [ ] **Step 4: Implement** — `worker/search.ts`

```ts
import { keywordRank, keywordScores, type Scored } from '../src/lib/keyword';
import type { SearchIndex } from '../src/lib/search-index';
import { blendRank } from '../src/lib/semantic';

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorCache {
  get(hash: string): Promise<number[] | null>;
  put(hash: string, vector: number[]): Promise<void>;
}

export interface SearchDeps {
  loadIndex(): Promise<SearchIndex>;
  embedder: Embedder;
  cache: VectorCache;
  timeoutMs?: number;
}

export type SearchResponse = { mode: 'semantic' | 'keyword'; results: Scored[] };

export const MAX_QUERY_LENGTH = 200;
export const DEFAULT_TIMEOUT_MS = 3000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function semanticRank(
  query: string,
  index: SearchIndex,
  deps: SearchDeps,
  keyword: Map<string, number>,
): Promise<Scored[]> {
  const cached = await Promise.all(index.mantras.map((m) => deps.cache.get(m.hash).catch(() => null)));
  const missing = index.mantras.filter((_, i) => !cached[i]);
  const vectors = await deps.embedder.embed([query, ...missing.map((m) => m.searchText)]);
  if (vectors.length !== missing.length + 1) {
    throw new Error(`embedder returned ${vectors.length} vectors, expected ${missing.length + 1}`);
  }
  const [queryVector, ...fresh] = vectors;
  const byId = new Map<string, number[]>();
  index.mantras.forEach((m, i) => {
    const vec = cached[i];
    if (vec) byId.set(m.id, vec);
  });
  missing.forEach((m, i) => byId.set(m.id, fresh[i]));
  await Promise.all(missing.map((m, i) => deps.cache.put(m.hash, fresh[i]).catch(() => {})));
  return blendRank(index.mantras.map((m) => m.id), queryVector, byId, keyword);
}

export async function handleSearch(url: URL, deps: SearchDeps): Promise<Response> {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return json({ error: 'Query parameter "q" is required.' }, 400);
  if (q.length > MAX_QUERY_LENGTH) return json({ error: `Query must be at most ${MAX_QUERY_LENGTH} characters.` }, 400);

  const index = await deps.loadIndex();
  const keyword = keywordScores(q, index);
  try {
    const results = await withTimeout(semanticRank(q, index, deps, keyword), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return json({ mode: 'semantic', results } satisfies SearchResponse);
  } catch (err) {
    console.error('semantic search failed, using keyword fallback', err);
    return json({ mode: 'keyword', results: keywordRank(q, index) } satisfies SearchResponse);
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/unit/search-handler.test.ts`
Expected: PASS. (`'confused'` → light: cosine 1 + 0.1 × keyword 1 = 1.1.)

- [ ] **Step 6: Commit**

```bash
git add worker/search.ts test/fixtures test/unit/search-handler.test.ts
git commit -m "Add search handler with semantic ranking and keyword fallback"
```

---

### Task 7: Worker entry, wrangler config, Worker integration tests

**Files:**
- Create: `worker/index.ts`, `wrangler.jsonc`, `worker/tsconfig.json`, `worker-configuration.d.ts` (generated), `vitest.worker.config.ts`, `test/worker/wrangler.test.jsonc`
- Modify: `vitest.config.ts` (add worker project)
- Test: `test/worker/api.test.ts`

**Interfaces:**
- Consumes: `handleSearch`, `SearchDeps` (Task 6), `SearchIndex` (Task 3).
- Produces: Worker default export `{ fetch(request, env: Env, ctx) }`; bindings `ASSETS`, `AI`, `EMBEDDINGS`; constant `EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'`.

- [ ] **Step 1: Create `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mantra-for",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"],
    "not_found_handling": "404-page"
  },
  "ai": { "binding": "AI" },
  // No id: wrangler provisions the namespace on first deploy and writes it back.
  "kv_namespaces": [{ "binding": "EMBEDDINGS" }],
  "observability": { "enabled": true }
}
```

Confirm against current docs (Cloudflare skill / `wrangler` skill) that `run_worker_first` accepts an array of patterns and that KV bindings without `id` are auto-provisioned on `wrangler deploy`. If auto-provisioning isn't supported, leave a note for Task 12 to run `npx wrangler kv namespace create EMBEDDINGS` and paste the id.

- [ ] **Step 2: Generate types and create `worker/tsconfig.json`**

Run: `npx wrangler types`
Expected: writes `worker-configuration.d.ts` with `interface Env { ASSETS: Fetcher; AI: Ai; EMBEDDINGS: KVNamespace }` (names may vary slightly; use whatever it generates).

`worker/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2024"],
    "types": [],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": [
    "./**/*.ts",
    "../worker-configuration.d.ts",
    "../src/lib/text.ts",
    "../src/lib/schema.ts",
    "../src/lib/search-index.ts",
    "../src/lib/keyword.ts",
    "../src/lib/semantic.ts"
  ]
}
```

- [ ] **Step 3: Create the test wrangler config** — `test/worker/wrangler.test.jsonc`

The AI binding is deliberately omitted (it would reach the real account); tests inject a fake.
```jsonc
{
  "name": "mantra-for-test",
  "main": "../../worker/index.ts",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "../fixtures/assets", "binding": "ASSETS", "run_worker_first": ["/api/*"] },
  "kv_namespaces": [{ "binding": "EMBEDDINGS", "id": "test-embeddings" }]
}
```

`vitest.worker.config.ts`:
```ts
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [cloudflareTest({ wrangler: { configPath: './test/worker/wrangler.test.jsonc' } })],
  test: { name: 'worker', include: ['test/worker/**/*.test.ts'] },
});
```

Modify `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' } },
      './vitest.worker.config.ts',
    ],
  },
});
```

- [ ] **Step 4: Write the failing test** — `test/worker/api.test.ts`

```ts
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';

function fakeVector(text: string): number[] {
  const t = text.toLowerCase();
  if (/sad|grief|loss/.test(t)) return [1, 0, 0];
  if (/clarity|confus|foggy/.test(t)) return [0, 1, 0];
  return [0, 0, 1];
}

function fakeAI(calls: string[][] = []) {
  return {
    run: async (_model: string, input: { text: string[] }) => {
      calls.push(input.text);
      return { shape: [input.text.length, 3], data: input.text.map(fakeVector) };
    },
  };
}

const failingAI = { run: async () => { throw new Error('AI unavailable'); } };

async function fetchWith(path: string, ai: unknown, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const testEnv = { ...(env as object), AI: ai } as unknown as Env;
  const res = await worker.fetch(new Request(`https://example.com${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('worker /api/search', () => {
  it('returns semantic results and caches embeddings in KV', async () => {
    const calls: string[][] = [];
    const res = await fetchWith('/api/search?q=heavy%20with%20loss', fakeAI(calls));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'semantic', results: [{ id: 'comfort', score: 1 }] });
    expect(calls[0]).toHaveLength(3);
    expect(await (env as unknown as Env).EMBEDDINGS.get('emb:hash-comfort', 'json')).toEqual([1, 0, 0]);

    await fetchWith('/api/search?q=foggy', fakeAI(calls));
    expect(calls[1]).toEqual(['foggy']);
  });

  it('falls back to keyword results when AI fails', async () => {
    const res = await fetchWith('/api/search?q=sad', failingAI);
    expect(await res.json()).toEqual({ mode: 'keyword', results: [{ id: 'comfort', score: 1 }] });
  });

  it('400s on empty query and 405s on POST', async () => {
    expect((await fetchWith('/api/search?q=', fakeAI())).status).toBe(400);
    const post = await fetchWith('/api/search?q=sad', fakeAI(), { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET');
  });

  it('serves static assets for other paths', async () => {
    const res = await fetchWith('/search-index.json', fakeAI());
    expect(res.status).toBe(200);
    expect((await res.json()).mantras).toHaveLength(2);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run --project worker`
Expected: FAIL — cannot resolve `../../worker/index`. If instead the plugin fails to start, check the `@cloudflare/vitest-plugin` README for the current `cloudflareTest` option names and adjust `vitest.worker.config.ts` only.

- [ ] **Step 6: Implement** — `worker/index.ts`

```ts
import type { SearchIndex } from '../src/lib/search-index';
import { handleSearch } from './search';

export const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/search') return env.ASSETS.fetch(request);
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
    }
    return handleSearch(url, {
      async loadIndex() {
        const res = await env.ASSETS.fetch(new URL('/search-index.json', url));
        if (!res.ok) throw new Error(`search index unavailable: ${res.status}`);
        return res.json<SearchIndex>();
      },
      embedder: {
        async embed(texts) {
          const out = (await env.AI.run(EMBEDDING_MODEL, { text: texts })) as { data: number[][] };
          return out.data;
        },
      },
      cache: {
        get: (hash) => env.EMBEDDINGS.get<number[]>(`emb:${hash}`, 'json'),
        put: (hash, vector) => env.EMBEDDINGS.put(`emb:${hash}`, JSON.stringify(vector)),
      },
    });
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 7: Run all tests and type-check the worker**

Run: `npm test && npx tsc -p worker/tsconfig.json`
Expected: unit + worker projects PASS; tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add worker wrangler.jsonc worker-configuration.d.ts vitest.config.ts vitest.worker.config.ts test/worker
git commit -m "Add Worker entry serving assets and /api/search"
```

---

### Task 8: Seed content, Astro collections, catalog, content test

**Files:**
- Create: `content/mantras/gayatri.md`, `content/mantras/pratah-smarana.md`, `public/audio/gayatri.mp3`, `public/audio/pratah-smarana.mp3`, `src/content.config.ts`, `src/lib/catalog.ts`, `src/pages/search-index.json.ts`
- Test: `test/unit/content.test.ts`

**Interfaces:**
- Consumes: `mantraSchema`, `needSchema` (Task 2), `validateCatalog` (Task 2), `buildSearchIndex` (Task 3), `normalize` (Task 1).
- Produces:
  - Astro collections `mantras` (glob `content/mantras/[^_]*.md`) and `needs` (file `content/needs.yaml`).
  - `getCatalog(): Promise<Catalog>` where `Catalog = { mantras: CollectionEntry<'mantras'>[] /* sorted by name */; needs: Need[]; usedNeeds: Need[]; needById: Map<string, Need> }`. Throws `Error('Invalid content:\n- ...')` if validation fails.
  - Static route `/search-index.json`.

- [ ] **Step 1: Copy audio**

```bash
mkdir -p public/audio
cp ~/Development/anki-sanskrit/data/mantra_audio/gayatri.mp3 public/audio/gayatri.mp3
cp ~/Development/anki-sanskrit/data/mantra_audio/pratah_smarana.mp3 public/audio/pratah-smarana.mp3
```

- [ ] **Step 2: Write the failing content test** — `test/unit/content.test.ts`

```ts
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
  it('has the seed mantras', () => {
    expect(mantras.map((m) => m.id).sort()).toEqual(['gayatri', 'pratah-smarana']);
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
```

The template test will keep failing until Task 11 creates `_template.md`. To keep this task's cycle green, mark it `it.skip` here and Task 11 un-skips it:
```ts
  it.skip('the template parses against the schema', () => {
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/unit/content.test.ts`
Expected: FAIL — `ENOENT ... content/mantras`.

- [ ] **Step 4: Write `content/mantras/gayatri.md`**

```markdown
---
name: Gāyatrī Mantra
sanskrit: |
  ॐ भूर्भुवः स्वः
  तत्सवितुर्वरेण्यं
  भर्गो देवस्य धीमहि
  धियो यो नः प्रचोदयात्
transliteration: |
  oṃ bhūr bhuvaḥ svaḥ
  tat savitur vareṇyaṃ
  bhargo devasya dhīmahi
  dhiyo yo naḥ pracodayāt
translations:
  - label: After S. Radhakrishnan (1953)
    text: We meditate on the adorable glory of the radiant sun; may She inspire our intelligence.
word_meanings:
  - { sanskrit: ॐ, iast: oṃ, meaning: "the praṇava, the sacred syllable" }
  - { sanskrit: भूः, iast: bhūḥ, meaning: earth }
  - { sanskrit: भुवः, iast: bhuvaḥ, meaning: "the mid-region, the atmosphere" }
  - { sanskrit: स्वः, iast: svaḥ, meaning: heaven }
  - { sanskrit: तत्, iast: tat, meaning: that }
  - { sanskrit: सवितुः, iast: savituḥ, meaning: "of Savitṛ, the impelling sun (genitive of savitṛ)" }
  - { sanskrit: वरेण्यम्, iast: vareṇyam, meaning: "most excellent, to be chosen, desirable" }
  - { sanskrit: भर्गः, iast: bhargaḥ, meaning: "radiance, splendour" }
  - { sanskrit: देवस्य, iast: devasya, meaning: of the god }
  - { sanskrit: धीमहि, iast: dhīmahi, meaning: "may we meditate on, may we hold (1st person plural middle)" }
  - { sanskrit: धियः, iast: dhiyaḥ, meaning: "thoughts, insights (accusative plural)" }
  - { sanskrit: यः, iast: yaḥ, meaning: who }
  - { sanskrit: नः, iast: naḥ, meaning: "our, of us" }
  - { sanskrit: प्रचोदयात्, iast: pracodayāt, meaning: "may he impel, urge forward" }
source: Ṛgveda 3.62.10, prefixed with ॐ and the three vyāhṛtis
needs: [clarity, focus, morning]
summary: A dawn prayer that the light which illumines the world also move and clarify the mind.
audio:
  file: gayatri.mp3
  credit: Shri Rattan Mohan Sharma, via the Internet Archive
  url: https://archive.org/download/shri-rattan-mohan-sharma-gayatri-mantra/Shri%20Rattan%20Mohan%20Sharma%20%E2%80%94%20Gayatri%20Mantra.mp3
  notes: 3.10–27.73 s of the original (three passes of the mantra over a continuous drone), 0.15 s fade-in, 0.5 s fade-out, 192 kbps CBR.
---

## How it helps

The Gāyatrī asks for no particular outcome. Its one request is in the last line — *dhiyo yo naḥ pracodayāt*, "may it set our thoughts in motion." The thing being asked for is not an answer but a better instrument for finding answers: an intellect (*dhī*) that is lit and moving rather than clouded and stuck.

When the mind is foggy, scattered, or circling the same problem, the mantra shifts attention away from the content of the confusion and toward the faculty that sees. Its image is the sun at dawn: it doesn't argue with darkness, it simply rises, and things become visible. Holding that image — *bhargo devasya dhīmahi*, "we hold in mind the radiance of the divine" — while chanting gives the mind something steady and bright to rest on, which is often all that's needed for clarity to return on its own.

The three opening words (*bhūr bhuvaḥ svaḥ*: earth, atmosphere, sky) place you in the whole of the world before narrowing to the request, so the practice also widens perspective — a small problem seen against all three worlds tends to shrink to its real size.

## How to practice

- Traditionally recited at the junctions of the day (*sandhyā*) — dawn, noon, and dusk — and above all at sunrise, facing east.
- Sit upright. Chant aloud, softly, or silently; 3, 11, or 108 repetitions (with a mālā) are common counts. You can chant along with the recording and replay it as needed.
- Pause briefly after ॐ and after *svaḥ*; one line per breath is a natural pace for the verse itself.
- For focus before work or study, a short round of 11 with attention on the meaning of the last line works well.
- In orthodox lineages the mantra is received through initiation (*upanayana*); many contemporary teachers share it openly.

## Notes

ॐ and भूर्भुवः स्वः are the *mahāvyāhṛti* prefix — the three worlds — added in later ritual use; the three lines after it are the Ṛgvedic verse proper, addressed to Savitṛ in the *gāyatrī* metre the mantra is named for (three octosyllabic lines). Also called the *Sāvitrī* mantra.

In the last line धियः + यः shows visarga sandhi: *-aḥ* → *-o* before a voiced sound, giving धियो यो.

The verse's own grammar is masculine — यः and प्रचोदयात् refer back to सवितुः देवस्य — so translations render it "he"; the feminine "She" above follows the later devotional identification of the mantra with the goddess Gāyatrī, *Veda-mātā*, the Mother of the Vedas.
```

- [ ] **Step 5: Write `content/mantras/pratah-smarana.md`**

```markdown
---
name: Prātaḥ Smaraṇa Stotram
sanskrit: |
  प्रातः स्मरामि हृदि संस्फुरदात्मतत्त्वं
  सच्चित्सुखं परमहंसगतिं तुरीयम्
  यत्स्वप्नजागरसुषुप्तिमवैति नित्यं
  तद्ब्रह्म निष्कलमहं न च भूतसङ्घः

  प्रातर्भजामि मनसा वचसामगम्यं
  वाचो विभान्ति निखिला यदनुग्रहेण
  यन्नेतिनेतिवचनैर्निगमा अवोचं
  स्तं देवदेवमजमच्युतमाहुरग्र्यम्

  प्रातर्नमामि तमसः परमर्कवर्णं
  पूर्णं सनातनपदं पुरुषोत्तमाख्यम्
  यस्मिन्निदं जगदशेषमशेषमूर्तौ
  रज्ज्वां भुजङ्गम इव प्रतिभासितं वै
transliteration: |
  prātaḥ smarāmi hṛdi saṃsphurad ātma tattvaṃ
  sac cit sukhaṃ parama haṃsa gatiṃ turīyam
  yat svapna jāgara suṣuptim avaiti nityaṃ
  tad brahma niṣkalam ahaṃ na ca bhūta saṅghaḥ

  prātar bhajāmi manasā vacasām agamyaṃ
  vāco vibhānti nikhilā yad anugraheṇa
  yan neti neti vacanair nigamā avocaṃ
  s taṃ deva devam ajam acyutam āhur agryam

  prātar namāmi tamasaḥ param arka varṇaṃ
  pūrṇaṃ sanātana padaṃ puruṣottamākhyam
  yasminn idaṃ jagad aśeṣam aśeṣa mūrtau
  rajjvāṃ bhujaṅgama iva pratibhāsitaṃ vai
translations:
  - label: Swami Tadatmananda (Arsha Bodha)
    text: |
      At dawn, I meditate on the reality shining in my heart,
      sat chit ananda, sought by saints, transcendent,
      which forever abides in waking, dreams, and sleep.
      I am that indivisible brahman, not this material body.

      At dawn, I worship him beyond words and thoughts,
      who causes all words and thoughts to arise,
      declared as "not this, not this" in the scriptures,
      the unborn, immutable, primal, god of gods.

      At dawn, I bow to him shining through the darkness,
      the limitless, eternal abode, the supreme person,
      in whom the entire world appears
      like a snake appears on a rope.
source: Attributed to Ādi Śaṅkara; three verses (the closing phala-śruti verse is omitted)
needs: [morning, peace, fear, clarity]
summary: Three dawn verses that begin the day by remembering the awareness untouched by everything that happens in it.
audio:
  file: pratah-smarana.mp3
  credit: Swami Tadatmananda, Arsha Bodha Center — chanted in Rāga Bhairav
  url: https://www.youtube.com/watch?v=cqPlGaHQUNQ
  notes: Essentially the whole recitation (0.0–233.60 s), 0.05 s fade-in, 0.5 s fade-out, 160 kbps CBR.
---

## How it helps

Each verse opens at dawn — *prātaḥ smarāmi*, *prātar bhajāmi*, *prātar namāmi*: I remember, I worship, I bow. Before the day's roles and worries have taken hold, the stotram reminds you what you are underneath them: the awareness that is present through waking, dreaming, and deep sleep (*svapna-jāgara-suṣupti*), and that none of those states can damage. *Ahaṃ na ca bhūta-saṅghaḥ* — "I am not this bundle of elements."

That recognition is the source of the peace it offers. It isn't peace as the absence of problems, but a vantage point the problems don't reach. The final image is the classic Advaita example: in dim light a rope is mistaken for a snake. The fear is completely real as an experience, yet nothing dangerous was ever there. Anxiety about the day ahead can be held the same way — felt, acknowledged, and seen against something steadier than it.

Starting the morning from that place tends to colour the rest of the day: events still happen, but there is a bit more room between you and them, and decisions get made from clarity rather than reaction.

## How to practice

- Recite once, slowly, soon after waking — ideally before reaching for your phone.
- Chant along with the recording (Swami Tadatmananda, in Rāga Bhairav, a traditional morning rāga), or read one verse a day and stay with it.
- Afterwards, sit for a few minutes with the first verse's question: what is it that is aware of waking, of dreams, and of sleep — and is it disturbed by any of them?
- When anxious later in the day, recall the rope and the snake: notice the fear, then ask what is actually there.

## Notes

The pada break in verse 2 falls mid-sandhi: …निगमा अवोचं / स्तं देवदेवम्… reads continuously as *nigamā avocaṃs taṃ devadevam* ("the scriptures declared him … the god of gods") — स्/स is the start of तम् carried onto the next printed line, a common effect of the metre not aligning with word boundaries.

A fourth, *phala-śruti* verse ("whoever recites this at dawn attains the supreme state") traditionally follows but is omitted here, the focus being the meditation itself rather than the fruit of reciting it.
```

- [ ] **Step 6: Run content test**

Run: `npx vitest run test/unit/content.test.ts`
Expected: PASS (template test skipped). If YAML parsing of `ॐ` or other unquoted Devanagari values in flow mappings fails, quote them.

- [ ] **Step 7: Create `src/content.config.ts`**

```ts
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { mantraSchema, needSchema } from './lib/schema';

const mantras = defineCollection({
  loader: glob({ base: './content/mantras', pattern: '[^_]*.md' }),
  schema: mantraSchema,
});

const needs = defineCollection({
  loader: file('./content/needs.yaml'),
  schema: needSchema,
});

export const collections = { mantras, needs };
```

- [ ] **Step 8: Create `src/lib/catalog.ts`**

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
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
  const errors = validateCatalog({ mantras: mantras.map((m) => ({ id: m.id, data: m.data })), needs, audioFiles });
  if (errors.length > 0) throw new Error(`Invalid content:\n- ${errors.join('\n- ')}`);
  const sorted = [...mantras].sort((a, b) => normalize(a.data.name).localeCompare(normalize(b.data.name)));
  return {
    mantras: sorted,
    needs,
    usedNeeds: needs.filter((n) => mantras.some((m) => m.data.needs.includes(n.id))),
    needById: new Map(needs.map((n) => [n.id, n])),
  };
}
```

- [ ] **Step 9: Create `src/pages/search-index.json.ts`**

```ts
import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/catalog';
import { buildSearchIndex } from '../lib/search-index';

export const GET: APIRoute = async () => {
  const { mantras, needs } = await getCatalog();
  const index = await buildSearchIndex(
    mantras.map((m) => ({ id: m.id, data: m.data, body: m.body ?? '' })),
    needs,
  );
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 10: Build and verify the index; verify validation fails the build**

Run: `npm run build && node -e "const i=require('./dist/search-index.json');console.log(i.mantras.map(m=>m.id), i.needs.length)"`
Expected: `[ 'gayatri', 'pratah-smarana' ] 10`.

Then temporarily add `joy` to `needs:` in `gayatri.md`, run `npm run build`, expect it to FAIL with `gayatri: unknown need "joy"`, then revert the edit.

- [ ] **Step 11: Commit**

```bash
git add content/mantras public/audio src/content.config.ts src/lib/catalog.ts src/pages/search-index.json.ts test/unit/content.test.ts
git commit -m "Add seed mantras, content collections, and search index route"
```

---

### Task 9: Layout, mantra page, need page, 404

**Files:**
- Create: `src/lib/rehype-collapsible.ts`, `src/layouts/Base.astro`, `src/styles/global.css`, `src/components/MantraCard.astro`, `src/components/NeedChips.astro`, `src/pages/m/[id].astro`, `src/pages/need/[id].astro`, `src/pages/404.astro`
- Modify: `astro.config.ts` (register rehype plugin)
- Test: `test/unit/rehype-collapsible.test.ts`

**Interfaces:**
- Consumes: `getCatalog` (Task 8), `firstLine` (Task 1).
- Produces:
  - `rehypeCollapsibleSections(options: { headings: string[] })` — rehype plugin; wraps each matching `h2` and its following siblings (until the next `h1`/`h2`) in `<details class="collapsible"><summary>…</summary>…</details>`.
  - `MantraCard.astro` props `{ id: string; name: string; firstLine: string; summary: string; needs: Need[]; hasAudio: boolean }`; root element `<li class="mantra-card" data-id={id} data-needs={needs.map(n => n.id).join(' ')}>`.
  - `NeedChips.astro` props `{ needs: Need[]; active?: string }`; each chip is `<a class="chip" href={`/need/${id}/`} data-need={id}>`.
  - `Base.astro` props `{ title: string; description?: string }`, default slot.

Before writing markup and CSS, invoke the `frontend-design:frontend-design` skill for the visual direction (calm, readable, mobile-first, light/dark, Devanagari-first typography). The structure below is the contract; styling is yours within it.

- [ ] **Step 1: Write the failing test** — `test/unit/rehype-collapsible.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { rehypeCollapsibleSections } from '../../src/lib/rehype-collapsible';

const h = (tagName: string, text: string) => ({
  type: 'element', tagName, properties: {}, children: [{ type: 'text', value: text }],
});

describe('rehypeCollapsibleSections', () => {
  it('wraps the Notes section in details until the next h2', () => {
    const tree = { type: 'root', children: [h('h2', 'How it helps'), h('p', 'a'), h('h2', 'Notes'), h('p', 'b'), h('p', 'c'), h('h2', 'After'), h('p', 'd')] };
    rehypeCollapsibleSections({ headings: ['Notes'] })(tree as never);
    const tags = tree.children.map((c: any) => c.tagName);
    expect(tags).toEqual(['h2', 'p', 'details', 'h2', 'p']);
    const details: any = tree.children[2];
    expect(details.properties).toEqual({ className: ['collapsible'] });
    expect(details.children[0]).toMatchObject({ tagName: 'summary', children: [{ type: 'text', value: 'Notes' }] });
    expect(details.children.slice(1).map((c: any) => c.children[0].value)).toEqual(['b', 'c']);
  });

  it('leaves trees without matching headings untouched', () => {
    const tree = { type: 'root', children: [h('h2', 'How it helps'), h('p', 'a')] };
    rehypeCollapsibleSections({ headings: ['Notes'] })(tree as never);
    expect(tree.children.map((c: any) => c.tagName)).toEqual(['h2', 'p']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/rehype-collapsible.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement** — `src/lib/rehype-collapsible.ts`

```ts
interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

function textOf(node: Node): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

const isSectionBreak = (n: Node) => n.type === 'element' && (n.tagName === 'h1' || n.tagName === 'h2');

export function rehypeCollapsibleSections({ headings }: { headings: string[] }) {
  const wanted = new Set(headings.map((h) => h.trim().toLowerCase()));
  return (tree: Node) => {
    const out: Node[] = [];
    const children = tree.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.tagName !== 'h2' || !wanted.has(textOf(node).trim().toLowerCase())) {
        out.push(node);
        continue;
      }
      const body: Node[] = [];
      while (i + 1 < children.length && !isSectionBreak(children[i + 1])) body.push(children[++i]);
      out.push({
        type: 'element',
        tagName: 'details',
        properties: { className: ['collapsible'] },
        children: [{ type: 'element', tagName: 'summary', properties: {}, children: node.children ?? [] }, ...body],
      });
    }
    tree.children = out;
  };
}
```

Register in `astro.config.ts`:
```ts
import { defineConfig } from 'astro/config';
import { rehypeCollapsibleSections } from './src/lib/rehype-collapsible';

export default defineConfig({
  output: 'static',
  build: { format: 'directory' },
  markdown: {
    rehypePlugins: [[rehypeCollapsibleSections, { headings: ['Notes'] }]],
  },
});
```

- [ ] **Step 4: Run test**

Run: `npx vitest run test/unit/rehype-collapsible.test.ts`
Expected: PASS.

- [ ] **Step 5: Create layout, styles and components**

`src/layouts/Base.astro`:
```astro
---
import '@fontsource/noto-serif-devanagari/400.css';
import '@fontsource/noto-serif-devanagari/600.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/600.css';
import '../styles/global.css';

interface Props { title: string; description?: string }
const { title, description = 'Mantras and meditations, searchable by what you need.' } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <meta name="color-scheme" content="light dark" />
    <title>{title}</title>
  </head>
  <body>
    <header class="site-header"><a href="/" class="wordmark">Mantra For</a></header>
    <main><slot /></main>
  </body>
</html>
```

`src/styles/global.css` — must define, at minimum: color tokens on `:root` with a `@media (prefers-color-scheme: dark)` override; `body` background and text color from tokens; `.sanskrit` (Noto Serif Devanagari, large, generous line-height, `white-space: pre-line`); `.iast` (EB Garamond italic, `white-space: pre-line`); `.chip`, `.chip[aria-current="true"]`; `.mantra-card`; `details.collapsible`; `[hidden] { display: none !important; }`; a single-column layout with `max-width: 40rem`, 16px side gutter, no horizontal scroll at 320px width. Exact palette and spacing come from the frontend-design pass.

`src/components/NeedChips.astro`:
```astro
---
import type { Need } from '../lib/schema';
interface Props { needs: Need[]; active?: string }
const { needs, active } = Astro.props;
---
<nav class="chips" aria-label="Browse by need">
  {needs.map((n) => (
    <a class="chip" href={`/need/${n.id}/`} data-need={n.id} aria-current={n.id === active ? 'true' : undefined}>{n.label}</a>
  ))}
</nav>
```

`src/components/MantraCard.astro`:
```astro
---
import type { Need } from '../lib/schema';
interface Props { id: string; name: string; firstLine: string; summary: string; needs: Need[]; hasAudio: boolean }
const { id, name, firstLine, summary, needs, hasAudio } = Astro.props;
---
<li class="mantra-card" data-id={id} data-needs={needs.map((n) => n.id).join(' ')}>
  <a href={`/m/${id}/`}>
    <h2>{name}{hasAudio && <span class="audio-mark" aria-label="has recording" title="Has recording"> 🔊</span>}</h2>
    <p class="sanskrit-line" lang="sa">{firstLine}</p>
    <p class="summary">{summary}</p>
  </a>
  <ul class="tags">{needs.map((n) => <li>{n.label}</li>)}</ul>
</li>
```

- [ ] **Step 6: Create the mantra page** — `src/pages/m/[id].astro`

```astro
---
import { render } from 'astro:content';
import Base from '../../layouts/Base.astro';
import { getCatalog } from '../../lib/catalog';

export async function getStaticPaths() {
  const { mantras } = await getCatalog();
  return mantras.map((entry) => ({ params: { id: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { needById } = await getCatalog();
const { Content } = await render(entry);
const d = entry.data;
---
<Base title={`${d.name} · Mantra For`} description={d.summary}>
  <article class="mantra">
    <h1>{d.name}</h1>
    {d.source && <p class="source">{d.source}</p>}
    <p class="sanskrit" lang="sa">{d.sanskrit.trim()}</p>
    {d.transliteration && <p class="iast" lang="sa-Latn">{d.transliteration.trim()}</p>}
    {d.audio && (
      <figure class="recording">
        <audio controls preload="none" src={`/audio/${d.audio.file}`}></audio>
        {d.audio.credit && (
          <figcaption>
            {d.audio.url ? <a href={d.audio.url}>{d.audio.credit}</a> : d.audio.credit}
          </figcaption>
        )}
      </figure>
    )}
    {d.translations.map((t) => (
      <section class="translation">
        <h2>Translation</h2>
        <p class="translation-text">{t.text.trim()}</p>
        <p class="translation-label">{t.label}</p>
      </section>
    ))}
    <div class="body"><Content /></div>
    {d.word_meanings.length > 0 && (
      <details class="collapsible">
        <summary>Word meanings</summary>
        <dl class="word-meanings">
          {d.word_meanings.map((w) => (
            <div><dt><span lang="sa">{w.sanskrit}</span> <span class="iast-inline">{w.iast}</span></dt><dd>{w.meaning}</dd></div>
          ))}
        </dl>
      </details>
    )}
    <ul class="tags">
      {d.needs.map((id) => <li><a href={`/?need=${id}`}>{needById.get(id)?.label ?? id}</a></li>)}
    </ul>
  </article>
</Base>
```

`.translation-text` needs `white-space: pre-line` in CSS (multi-verse translations).

- [ ] **Step 7: Create the need page** — `src/pages/need/[id].astro`

```astro
---
import Base from '../../layouts/Base.astro';
import MantraCard from '../../components/MantraCard.astro';
import NeedChips from '../../components/NeedChips.astro';
import { getCatalog } from '../../lib/catalog';
import { firstLine } from '../../lib/text';

export async function getStaticPaths() {
  const { usedNeeds } = await getCatalog();
  return usedNeeds.map((need) => ({ params: { id: need.id }, props: { need } }));
}

const { need } = Astro.props;
const { mantras, usedNeeds, needById } = await getCatalog();
const matching = mantras.filter((m) => m.data.needs.includes(need.id));
---
<Base title={`${need.label} · Mantra For`}>
  <h1>Mantras for {need.label.toLowerCase()}</h1>
  <NeedChips needs={usedNeeds} active={need.id} />
  <ul class="results">
    {matching.map((m) => (
      <MantraCard id={m.id} name={m.data.name} firstLine={firstLine(m.data.sanskrit)} summary={m.data.summary}
        needs={m.data.needs.map((n) => needById.get(n)!)} hasAudio={Boolean(m.data.audio)} />
    ))}
  </ul>
</Base>
```

- [ ] **Step 8: Create `src/pages/404.astro`**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Not found · Mantra For">
  <h1>Nothing here</h1>
  <p><a href="/">Search the mantras</a> instead.</p>
</Base>
```

- [ ] **Step 9: Build and inspect**

Run: `npm run build && ls dist/m dist/need && grep -c '<details class="collapsible"' dist/m/gayatri/index.html`
Expected: `dist/m` has `gayatri`, `pratah-smarana`; `dist/need` has `clarity fear focus morning peace`; grep count `2` (Notes + Word meanings). `dist/m/pratah-smarana/index.html` has count `1`.

Run `npm test` — all PASS.

- [ ] **Step 10: Commit**

```bash
git add astro.config.ts src test/unit/rehype-collapsible.test.ts
git commit -m "Add layout, mantra pages, need pages, and 404"
```

---

### Task 10: Home page and client search

**Files:**
- Create: `src/lib/url-state.ts`, `src/scripts/home.ts`
- Modify: `src/pages/index.astro` (replace placeholder)
- Test: `test/unit/url-state.test.ts`

**Interfaces:**
- Consumes: `keywordRank`, `Scored` (Task 4); `SearchIndex` (Task 3); `MantraCard`, `NeedChips`, `Base` (Task 9); `getCatalog` (Task 8); `SearchResponse` shape `{ mode, results: { id, score }[] }` (Task 6).
- Produces:
  ```ts
  type UrlState = { kind: 'all' } | { kind: 'need'; need: string } | { kind: 'query'; q: string }
  function parseState(search: string): UrlState      // q wins over need; blank values → all
  function stateToSearch(state: UrlState): string     // '' | '?need=x' | '?q=...'
  ```

- [ ] **Step 1: Write the failing test** — `test/unit/url-state.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { parseState, stateToSearch } from '../../src/lib/url-state';

describe('parseState', () => {
  it('parses all, need, and query states', () => {
    expect(parseState('')).toEqual({ kind: 'all' });
    expect(parseState('?need=sadness')).toEqual({ kind: 'need', need: 'sadness' });
    expect(parseState('?q=I%20feel%20lost')).toEqual({ kind: 'query', q: 'I feel lost' });
  });
  it('treats blank values as all and prefers q over need', () => {
    expect(parseState('?q=')).toEqual({ kind: 'all' });
    expect(parseState('?q=%20%20&need=')).toEqual({ kind: 'all' });
    expect(parseState('?need=fear&q=dread')).toEqual({ kind: 'query', q: 'dread' });
  });
  it('passes unknown need ids through (caller shows empty state)', () => {
    expect(parseState('?need=unknown')).toEqual({ kind: 'need', need: 'unknown' });
  });
});

describe('stateToSearch', () => {
  it('round-trips', () => {
    for (const s of ['', '?need=sadness', '?q=I+feel+lost']) {
      expect(stateToSearch(parseState(s))).toBe(s);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/url-state.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement** — `src/lib/url-state.ts`

```ts
export type UrlState = { kind: 'all' } | { kind: 'need'; need: string } | { kind: 'query'; q: string };

export function parseState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const q = (params.get('q') ?? '').trim();
  if (q) return { kind: 'query', q };
  const need = (params.get('need') ?? '').trim();
  if (need) return { kind: 'need', need };
  return { kind: 'all' };
}

export function stateToSearch(state: UrlState): string {
  if (state.kind === 'all') return '';
  const params = new URLSearchParams(state.kind === 'need' ? { need: state.need } : { q: state.q });
  return `?${params}`;
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run test/unit/url-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the home page** — `src/pages/index.astro`

```astro
---
import Base from '../layouts/Base.astro';
import MantraCard from '../components/MantraCard.astro';
import NeedChips from '../components/NeedChips.astro';
import { getCatalog } from '../lib/catalog';
import { firstLine } from '../lib/text';

const { mantras, usedNeeds, needById } = await getCatalog();
---
<Base title="Mantra For">
  <form class="search" action="/" method="get" role="search">
    <label for="q" class="visually-hidden">What do you need right now?</label>
    <input id="q" name="q" type="search" maxlength="200" placeholder="What do you need right now?" autocomplete="off" />
    <button type="submit">Search</button>
  </form>
  <NeedChips needs={usedNeeds} />
  <p class="status" role="status" aria-live="polite" hidden></p>
  <ul class="results" id="results">
    {mantras.map((m) => (
      <MantraCard id={m.id} name={m.data.name} firstLine={firstLine(m.data.sanskrit)} summary={m.data.summary}
        needs={m.data.needs.map((n) => needById.get(n)!)} hasAudio={Boolean(m.data.audio)} />
    ))}
  </ul>
  <script>
    import { initHome } from '../scripts/home';
    initHome();
  </script>
</Base>
```

Without JS, the form submits `/?q=…` and shows all mantras; chips go to `/need/<id>/`. Add `.visually-hidden` to `global.css`.

- [ ] **Step 6: Write the client script** — `src/scripts/home.ts`

```ts
import { keywordRank, type Scored } from '../lib/keyword';
import type { SearchIndex } from '../lib/search-index';
import { parseState, stateToSearch, type UrlState } from '../lib/url-state';

let indexPromise: Promise<SearchIndex> | undefined;
const loadIndex = () => (indexPromise ??= fetch('/search-index.json').then((r) => r.json() as Promise<SearchIndex>));

async function search(q: string): Promise<Scored[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`search ${res.status}`);
    return ((await res.json()) as { results: Scored[] }).results;
  } catch {
    return keywordRank(q, await loadIndex());
  }
}

export function initHome(): void {
  const form = document.querySelector<HTMLFormElement>('form.search')!;
  const input = form.querySelector<HTMLInputElement>('input[name="q"]')!;
  const list = document.getElementById('results')!;
  const status = document.querySelector<HTMLElement>('.status')!;
  const cards = [...list.querySelectorAll<HTMLLIElement>('.mantra-card')];
  const chips = [...document.querySelectorAll<HTMLAnchorElement>('.chip')];
  const labelOf = new Map(chips.map((c) => [c.dataset.need!, c.textContent ?? '']));
  let generation = 0;

  function show(ids: string[] | null, message: string) {
    const byId = new Map(cards.map((c) => [c.dataset.id!, c]));
    const ordered = ids ? ids.map((id) => byId.get(id)).filter((c): c is HTMLLIElement => Boolean(c)) : cards;
    const visible = new Set(ordered);
    for (const card of cards) card.hidden = !visible.has(card);
    list.append(...ordered, ...cards.filter((c) => !visible.has(c)));
    status.textContent = message;
    status.hidden = !message;
  }

  async function apply(state: UrlState) {
    const run = ++generation;
    for (const chip of chips) {
      if (state.kind === 'need' && chip.dataset.need === state.need) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    }
    if (state.kind === 'all') {
      input.value = '';
      show(null, '');
    } else if (state.kind === 'need') {
      input.value = '';
      const ids = cards.filter((c) => c.dataset.needs!.split(' ').includes(state.need)).map((c) => c.dataset.id!);
      const label = labelOf.get(state.need);
      show(ids, ids.length ? `For ${label ?? state.need}` : 'No mantras for that yet — try another feeling below.');
    } else {
      input.value = state.q;
      status.textContent = 'Searching…';
      status.hidden = false;
      const results = await search(state.q);
      if (run !== generation) return; // a newer navigation superseded this one
      const ids = results.map((r) => r.id);
      show(ids, ids.length ? `${ids.length} for “${state.q}”` : 'Nothing matched — try different words, or pick a feeling below.');
    }
  }

  function navigate(state: UrlState) {
    history.pushState(null, '', `/${stateToSearch(state)}`);
    void apply(state);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    navigate(parseState(`?q=${encodeURIComponent(input.value)}`));
  });
  for (const chip of chips) {
    chip.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate({ kind: 'need', need: chip.dataset.need! });
    });
  }
  window.addEventListener('popstate', () => void apply(parseState(location.search)));
  void apply(parseState(location.search));
}
```

- [ ] **Step 7: Verify in a browser against the real Worker**

Run: `npm run build && npx wrangler dev --local` (background). Note: `wrangler dev` reaches real Workers AI for the `AI` binding and needs `wrangler login`; if not logged in, the API falls back to keyword mode — which is itself worth checking.

Using Playwright (or by hand) at 390×844 and 1280×800, verify:
1. `/` shows both mantras and 5 chips in `needs.yaml` order: Fear & Anxiety, Focus, Clarity, Peace, Morning practice.
2. Tapping **Peace** → URL `/?need=peace`, only Prātaḥ Smaraṇa visible, chip highlighted; Back returns to all.
3. Searching `zebra crossing` → status "Nothing matched…" (or, in semantic mode, only genuinely close results) — no errors, cards hidden accordingly.
4. Searching `foggy mind before work` → Gāyatrī listed (keyword: `foggy`→clarity, `work`→focus).
5. `/?need=unknown` → empty-state message, no crash. `/?q=` → all mantras.
6. `/m/gayatri/` → Devanagari, IAST, audio player that plays once, translation, sections, Notes and Word meanings collapsed. No horizontal scroll at 320px width.
7. With JS disabled, chips navigate to `/need/<id>/` pages.

Stop the dev server afterwards.

- [ ] **Step 8: Run all checks**

Run: `npm test && npm run check`
Expected: all PASS; `astro check` 0 errors; worker tsc 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src test/unit/url-state.test.ts
git commit -m "Add home page with need chips and client-side search"
```

---

### Task 11: Authoring template, guide, README

**Files:**
- Create: `content/mantras/_template.md`, `docs/adding-a-mantra.md`
- Modify: `README.md`, `test/unit/content.test.ts` (un-skip template test)

**Interfaces:**
- Consumes: schema fields (Task 2), needs vocabulary (Task 2), content test (Task 8).

- [ ] **Step 1: Un-skip the template test and run it**

In `test/unit/content.test.ts` change `it.skip('the template parses against the schema'` → `it('the template parses against the schema'`.
Run: `npx vitest run test/unit/content.test.ts`
Expected: FAIL — ENOENT `_template.md`.

- [ ] **Step 2: Create `content/mantras/_template.md`**

```markdown
---
# Copy this file to content/mantras/<id>.md — the filename (kebab-case) becomes the URL /m/<id>/.
# Files starting with "_" are ignored by the site.

name: Name of the Mantra                 # required — display name, IAST diacritics welcome
sanskrit: |                              # required — Devanagari, one line per pāda
  ॐ
transliteration: |                       # optional — IAST, lines matching the Sanskrit
  oṃ
translations:                            # optional — any number
  - label: Translator or source          # who the translation is by / after
    text: |
      English translation.
word_meanings:                           # optional — word-by-word gloss
  - { sanskrit: "ॐ", iast: "oṃ", meaning: "the sacred syllable" }
source: Text, chapter.verse              # optional — where the mantra comes from
needs: [peace]                           # required — ids from content/needs.yaml
summary: One line on what this mantra is for.   # required — shown on search result cards
audio:                                   # optional — delete this block if there is no recording
  file: name-of-the-mantra.mp3           # must exist in public/audio/
  credit: Reciter, via Source            # optional
  url: https://example.com/original      # optional — link to the original recording
  notes: How the clip was trimmed.       # optional
---

## How it helps

How this mantra works on the needs listed above — what it asks for, what image or idea it
holds the mind on, and why that helps. This section is what semantic search reads most closely.

## How to practice

- When to recite it, how many repetitions, posture, breath.

## Notes

Grammar, sandhi, history, variants. Rendered collapsed on the page.
```

- [ ] **Step 3: Run test**

Run: `npx vitest run test/unit/content.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `docs/adding-a-mantra.md`**

```markdown
# Adding a mantra

1. Copy `content/mantras/_template.md` to `content/mantras/<id>.md`. The id is kebab-case
   (`maha-mrityunjaya`) and becomes the URL `/m/<id>/`.
2. Fill in the fields (reference below), delete optional ones you don't use.
3. Run `npm test` — it validates every mantra file, need reference, and audio file.
4. Commit and push to `main`; Cloudflare rebuilds and deploys.

## Fields

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Display name. |
| `sanskrit` | yes | Devanagari. Use `|` for multi-line; blank lines separate verses. |
| `transliteration` | no | IAST, line-for-line with the Sanskrit. |
| `translations` | no | List of `{ label, text }`. Label credits the translator. |
| `word_meanings` | no | List of `{ sanskrit, iast, meaning }`. Shown collapsed. |
| `source` | no | Where the text comes from. |
| `needs` | yes | One or more ids from `content/needs.yaml`. |
| `summary` | yes | One line, shown on result cards. Say what it's *for*. |
| `audio` | no | `{ file, credit?, url?, notes? }`; `file` lives in `public/audio/`. |

The Markdown body uses three conventional sections: `## How it helps`, `## How to practice`,
`## Notes` (Notes renders collapsed). Longer meditations can add their own sections.

## Choosing needs

Pick the two to four needs the mantra most directly serves — not every need it could touch.
Tags drive the chips on the home page and give a strong boost in search, so over-tagging makes
results noisier.

## Adding a new need

Add an entry to `content/needs.yaml`:

    - id: loneliness          # kebab-case, unique
      label: Loneliness       # chip text
      synonyms: [lonely, alone, isolated, disconnected]

Synonyms are single lowercase words people might type. A need's chip appears on the home page
once at least one mantra uses it.

## Adding audio

Put an mp3 in `public/audio/` named after the mantra id, and reference it in `audio.file`.
Credit the reciter and link the original. Keep files under ~10 MB.

## Writing good context

Search reads the name, summary, need labels, and the **How it helps** section. Write that section
the way you'd explain it to a friend in that state: what the mantra asks for, what it turns the
mind toward, and why that helps with *this* need. Concrete beats generic — "it shifts attention
from the content of the worry to the awareness that notices it" finds better matches than
"it brings peace".
```

- [ ] **Step 5: Write `README.md`**

```markdown
# Mantra For

A personal collection of mantras and meditations, searchable by what you need.

- `content/mantras/*.md` — one file per mantra ([how to add one](docs/adding-a-mantra.md))
- `content/needs.yaml` — the needs vocabulary behind the chips and search
- `worker/` — Cloudflare Worker: serves the site and `/api/search` (Workers AI embeddings, cached in KV, keyword fallback)

## Commands

    npm run dev       # Astro dev server (search falls back to keyword mode — no Worker)
    npm run preview   # build + wrangler dev (real Worker; AI calls need `wrangler login`)
    npm test          # unit + Worker tests, plus content validation
    npm run check     # astro check + Worker type-check
    npm run deploy    # build + wrangler deploy

## Dependencies

All dependencies track `@latest`, except `typescript`, pinned to 6.x because `@astrojs/check`
supports only `typescript ^5 || ^6`.
```

- [ ] **Step 6: Run everything**

Run: `npm test && npm run check && npm run build`
Expected: all PASS; template is not in `dist/m/`.

- [ ] **Step 7: Commit**

```bash
git add content/mantras/_template.md docs/adding-a-mantra.md README.md test/unit/content.test.ts
git commit -m "Add mantra template, authoring guide, and README"
```

---

### Task 12: Deploy (requires the owner)

This task publishes to the owner's Cloudflare account. **Ask the owner before running each outward-facing command** (`wrangler login`, `wrangler deploy`, pushing the branch, connecting Workers Builds).

- [ ] **Step 1: Final verification**

Run: `npm outdated; npm test && npm run check && npm run build`
Expected: only `typescript` listed by `npm outdated`; all checks pass.

- [ ] **Step 2: Authenticate** — owner runs `! npx wrangler login` in the session.

- [ ] **Step 3: Deploy**

Run: `npm run deploy`
Expected: wrangler provisions the `EMBEDDINGS` KV namespace (or, if auto-provisioning is unsupported, first run `npx wrangler kv namespace create EMBEDDINGS`, paste the id into `wrangler.jsonc`, and commit), uploads assets, prints the `*.workers.dev` URL. If wrangler wrote the KV id back into `wrangler.jsonc`, commit that change.

- [ ] **Step 4: Smoke-test production**

```bash
curl -s "https://<worker-url>/api/search?q=foggy%20mind" | head -c 400
curl -s "https://<worker-url>/api/search?q=anxious%20about%20the%20day" | head -c 400
```
Expected: `"mode":"semantic"`; Gāyatrī for the first, Prātaḥ Smaraṇa for the second. If real bge cosine scores for good matches fall below `SEMANTIC_THRESHOLD` (0.55) or junk queries pass it, tune the constant in `src/lib/semantic.ts`, update its unit tests if they depend on it, redeploy, and commit.

- [ ] **Step 5: Continuous deploys (owner, dashboard)**

With the owner: push the branch / merge to `main` on `github.com/mdayaram/mantra-for`, then in the Cloudflare dashboard connect the `mantra-for` Worker to the repo via Workers Builds (build command `npm run build`, deploy command `npx wrangler deploy`).
