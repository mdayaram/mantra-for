# Mantra Repository — Design

Date: 2026-10-10
Status: Draft for review

## Purpose

A personal, publicly reachable website that holds mantras and meditations and
lets the owner find one by need — e.g. when sad, search "sadness" (or "I feel
lost after the move") and get a few suitable mantras, each with context on how
it addresses that need.

- **Audience:** the owner. Others may see it; no SEO or growth work.
- **Visitors:** read-only.
- **Meditations** are mantras that may be longer; same data shape, no separate type.

## Architecture

```
repo
├── content/
│   ├── mantras/<id>.md        one file per mantra (YAML frontmatter + Markdown body)
│   ├── mantras/_template.md   template for new entries (excluded from the collection)
│   └── needs.yaml             controlled vocabulary of needs
├── public/audio/<id>.mp3      optional recordings
├── src/                       Astro site (pages, components, shared search code)
├── worker/                    Worker entry: /api/search, static assets for everything else
└── docs/adding-a-mantra.md    authoring guide
```

- **Astro, static output.** Content collections validate every mantra file at
  build time. Each mantra has a permalink and pages render without JavaScript.
- **One Cloudflare Worker with static assets** serves the built site and one
  dynamic route, `GET /api/search`. Bindings: `AI` (Workers AI) and `EMBEDDINGS`
  (KV).
- **Deploy:** Workers Builds (Cloudflare git integration) — push to `main` deploys.
- **Content authoring:** files in the repo only. No admin UI, no database.

## Data model

### Mantra file — `content/mantras/<id>.md`

The filename (without `.md`) is the id and URL slug. Files starting with `_`
are ignored.

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | yes | string | Display name, IAST diacritics allowed |
| `sanskrit` | yes | string (multiline) | Devanagari |
| `transliteration` | no | string (multiline) | IAST |
| `translations` | no | list of `{label, text}` | 0..n |
| `word_meanings` | no | list of `{sanskrit, iast, meaning}` | |
| `source` | no | string | Textual source |
| `needs` | yes, ≥1 | list of need ids | Each must exist in `needs.yaml` |
| `summary` | yes | string | One line, shown on result cards |
| `audio` | no | `{file, credit?, url?, notes?}` | `file` must exist in `public/audio/` |

Markdown body — conventional headings (in the template, not enforced):

- `## How it helps` — how the mantra serves its needs. **Used for embeddings.**
- `## How to practice` — when, repetitions, posture, breath.
- `## Notes` — grammar, sandhi, history.

### Needs vocabulary — `content/needs.yaml`

```yaml
- id: sadness
  label: Sadness
  synonyms: [sad, grief, sorrow, despondent, down, loss, mourning]
```

- `id`: kebab-case, unique. `label`: display text. `synonyms`: lowercase words
  used by keyword matching.
- Initial vocabulary is whatever the two seed mantras need plus a small set of
  common needs (sadness, fear & anxiety, anger, focus, clarity, gratitude,
  peace, protection, morning practice, healing); unused needs are not shown.

### Build validation (build fails on)

- Missing required field or wrong type.
- `needs` entry not defined in `needs.yaml`.
- `audio.file` not present in `public/audio/`.
- Duplicate need ids in `needs.yaml`.

## Search

### Search index

The build emits `/search-index.json`: for each mantra — `id`, `name`,
`summary`, `needs`, first Sanskrit line, `hasAudio`, `searchText`, and
`hash` (SHA-256 of `searchText`).

`searchText` = name + summary + need labels + the "How it helps" section
(plain text).

### `GET /api/search?q=<text>`

1. Validate: `q` non-empty after trim and ≤ 200 chars, else 400. (Need
   filtering is handled client-side from the index, not by the API.)
2. Load the search index (bundled static asset).
3. For each mantra, read `emb:<hash>` from KV. Embed all misses in one Workers
   AI call (`@cf/baai/bge-base-en-v1.5`), write them back to KV (no TTL; keys
   are content-addressed). Embed `q` in the same call.
4. Score = cosine(query, mantra) + keyword boost (see below). Return top 10
   with score > threshold (tuned during implementation), as
   `{mode: "semantic", results: [...]}`.

**Fallback:** if the AI call throws or exceeds ~3 s, return keyword-only
results with `mode: "keyword"`. If KV fails, embed without caching. A search
the keyword ranker can answer never returns 500.

### Keyword ranker (shared module)

Used by the Worker (fallback + boost) and the browser (offline fallback).

- Normalize: lowercase, strip diacritics (so "gayatri" matches "Gāyatrī").
- Query terms that match a need's `id`, `label`, or `synonyms` → mantras
  tagged with that need score strongly.
- Query terms appearing in `name`/`summary`/`searchText` score weakly.

## Pages

- **`/` Home** — search box ("What do you need right now?"), need chips for
  needs used by ≥1 mantra. Submitting or tapping a chip shows results in place
  and updates the URL to `/?q=…` or `/?need=…` (bookmarkable, back works).
  Empty state lists all mantras alphabetically. Chip filtering runs client-side
  from the index. If `/api/search` fails, the browser runs the keyword ranker
  over the index.
- **Result card** — name, first Sanskrit line, summary, need tags, audio marker.
- **`/m/<id>` Mantra** — large Devanagari, IAST, audio player (loop on by
  default) directly below the text, translations, "How it helps", "How to
  practice"; word meanings and Notes in collapsible sections. Need tags link to
  `/?need=…`.
- **`/need/<id>`** — static list of mantras for that need (no-JS fallback for
  chips; chips are plain links to it, enhanced with JS).

Look: calm, readable, mobile-first, light and dark. Noto Serif Devanagari plus
a Latin serif with full IAST coverage. Detailed visual design happens during
implementation.

## Testing (Vitest)

- Keyword ranker: synonym matching, diacritic-insensitivity, tag boost.
- Ranking: cosine + blend with a fake embedder.
- Worker (`@cloudflare/vitest-pool-workers`, AI mocked): semantic path, AI
  failure → keyword fallback, KV hit vs miss, 400 on bad input.
- Content: every mantra file loads through the schema; all `needs` and audio
  references resolve.

## Seed content

Hand-written (no migration script) from `~/Development/anki-sanskrit/data/mantras.json`:

- `gayatri` — Gāyatrī Mantra, with `gayatri.mp3`.
- `pratah-smarana` — Prātaḥ Smaraṇa Stotram, with `pratah_smarana.mp3`
  (renamed to `pratah-smarana.mp3`).

Carry over Sanskrit, IAST, translations, word meanings, source, notes, and
audio credit/trim notes. Newly written: `summary`, `needs`, "How it helps",
"How to practice" — for the owner to review.

## Deliverables beyond the site

- `content/mantras/_template.md` — every field, commented.
- `docs/adding-a-mantra.md` — field reference, choosing needs, adding a new
  need, adding audio, writing good context.

## Out of scope (v1)

Admin UI, accounts, favorites, Vectorize, phonetic transliteration, separate
meditation type, SEO work.
