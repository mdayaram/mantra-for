# Mantra For

A personal collection of mantras and meditations, searchable by what you need.
Live at <https://mantra-for.noj.cc>.

- `content/mantras/*.md` — one file per mantra ([how to add one](docs/adding-a-mantra.md))
- `content/needs.yaml` — the needs vocabulary behind the chips and search
- `worker/` — Cloudflare Worker: serves the site and `/api/search` (Workers AI embeddings, cached in KV, keyword fallback)

## Commands

    npm run dev       # Astro dev server (search falls back to keyword mode — no Worker)
    npm run preview   # build + wrangler dev (real Worker; AI calls need `wrangler login`)
    npm test          # unit + Worker tests, plus content validation
    npm run check     # astro check + Worker type-check
    npm run deploy    # build + wrangler deploy

## Coding agents

Claude Code and Codex share the same repository guidance and skills:

- `AGENTS.md` links to `CLAUDE.md`, the shared instructions. Edit `CLAUDE.md` to update both agents.
- `.agents/skills` links to `.claude/skills`, so Codex discovers the same project skills, including `add-mantra`. Add or edit skills in `.claude/skills`.

The links are relative and work after cloning. Start a new Codex session in this repository to load the instructions; invoke the content workflow with `$add-mantra`.

## Dependencies

All dependencies track `@latest`, except `typescript`, pinned to 6.x because `@astrojs/check`
supports only `typescript ^5 || ^6`. Markdown uses the `unified()` processor from
`@astrojs/markdown-remark` (not Astro 7's default Sätteri) so the `Notes` section can be
collapsed with a rehype plugin.
