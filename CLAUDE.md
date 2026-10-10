# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal site of mantras searchable by need, live at <https://mantra-for.noj.cc>. Astro (static output) served by a single Cloudflare Worker that also answers `/api/search`.

## Commands

```bash
npm test                                   # all Vitest projects: unit (node) + worker (workerd)
npx vitest run test/unit/keyword.test.ts   # one test file
npx vitest run --project unit              # node tests only (fast, no workerd)
npx vitest run --project worker            # Worker tests in workerd via @cloudflare/vitest-plugin
npm run check                              # astro check + tsc -p worker/tsconfig.json
npm run build                              # astro build → dist/ (fails on invalid content)
npm run dev                                # Astro dev server — no Worker, so /api/search 404s and the client falls back to keyword search
npm run preview                            # build + wrangler dev — real Worker; AI calls hit the real account (billed)
npx wrangler types                         # regenerate worker-configuration.d.ts after any wrangler.jsonc change (commit it)
```

There is no linter. Deploys are not run locally: Workers Builds deploys on merge to `main` (build `npm run build`, deploy `npx wrangler deploy`) and runs `npx wrangler preview` for other branches.

## Architecture

**Content → static site + search index.** Mantras are `content/mantras/<id>.md` (frontmatter + Markdown body; `_`-prefixed files ignored); needs are `content/needs.yaml`. `src/content.config.ts` loads both as Astro collections using the Zod schemas in `src/lib/schema.ts`. `src/lib/catalog.ts` (`getCatalog()`) is the single entry point every page uses: it loads collections, runs `validateCatalog` (unknown needs, missing audio files, bad ids, duplicate need ids), and throws — which is what makes `npm run build` fail on bad content. `src/pages/search-index.json.ts` emits `/search-index.json` via `buildSearchIndex`.

**Search pipeline.** `searchText` per mantra = name + summary + need labels + plain text of its `## How it helps` section; `hash` = SHA-256 of that text. The Worker (`worker/index.ts` → `worker/search.ts:handleSearch`) loads the index from the ASSETS binding, reads cached vectors from KV (`emb:<hash>`), embeds the query plus any misses in one Workers AI call (`@cf/baai/bge-base-en-v1.5`), and ranks with `blendRank` (cosine + 0.1 × keyword score, threshold `SEMANTIC_THRESHOLD` in `src/lib/semantic.ts`). Any AI error, a 3 s timeout, or a wrong vector count falls back to `keywordRank`. Because the cache is content-addressed, editing a mantra's text (or renaming a need label, which changes every tagged mantra's hash) re-embeds on the next search.

**Shared code across three runtimes.** `src/lib/{text,schema,search-index,keyword,semantic}.ts` run at build time (Node), in the Worker (workerd), and in the browser (`src/scripts/home.ts` uses `keywordRank` as its offline fallback). Keep them free of Node/Astro imports. `catalog.ts` (uses `astro:content`, `node:fs`) and `needs-file.ts` are build-only. `worker/tsconfig.json` lists the shared files explicitly — add new shared modules there.

**Home page enhancement.** `index.astro` server-renders every mantra card; `home.ts` only shows/hides and reorders those cards by the ids the API returns, driven by URL state (`/?q=`, `/?need=`, parsed in `src/lib/url-state.ts`). Chips are real links to static `/need/<id>/` pages so they work without JS.

## Gotchas

- `worker/index.ts` must export **only** the default handler — workerd treats any named export of the main module as an entrypoint and crashes at startup. A test in `test/worker/api.test.ts` guards this.
- Tests must never reach real Workers AI (it bills even locally). `test/worker/wrangler.test.jsonc` deliberately omits the AI binding; tests inject a fake via `{ ...env, AI: fake }`.
- Astro 7's default Markdown processor (Sätteri) doesn't run rehype plugins; `astro.config.ts` uses `unified()` from `@astrojs/markdown-remark` so `src/lib/rehype-collapsible.ts` can wrap `## Notes` in `<details>`.
- Astro's `file()` loader silently collapses duplicate ids in `needs.yaml`, so `catalog.ts` validates against the raw file via `readNeedsFile` instead.
- `wrangler.jsonc` needs the `previews` block for branch preview builds. The KV namespace has no `id` on purpose (auto-provisioned by Wrangler on deploy).
- Dependencies track `@latest`, except `typescript`, which stays on 6.x because `@astrojs/check` supports only `^5 || ^6`. `.node-version` pins an exact version (asdf rejects a bare major).

## Adding content

To add a mantra for the owner, use the project skill `.claude/skills/add-mantra/` (research → owner-approved draft → verify → PR). Manually: copy `content/mantras/_template.md`; full field reference and guidance on choosing needs and writing the "How it helps" section (what search reads most closely) are in `docs/adding-a-mantra.md`. Design rationale: `docs/superpowers/specs/2026-10-10-mantra-repository-design.md`.
