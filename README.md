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

## Offline app

The production build generates a versioned service worker from every file in `dist/`.
On the first online visit it downloads all pages, fonts, scripts, the search index,
and recordings (currently about 10 MB of audio). Wait for “Available offline” before
disconnecting. On iPhone, use Safari’s Share → Add to Home Screen; on Android use
the browser’s Install app/Add to Home screen option.

Offline searches use local keywords; online searches use the search API with a
four-second client timeout. Audio supports offline playback and seeking. External
source links still need a connection. Updates download a complete new snapshot and
activate after existing app windows/tabs close. Storage remains subject to browser
quotas and eviction, even when installed; the app requests persistent storage where
supported. An incomplete download leaves the previous snapshot intact.

To check offline behavior without billed AI calls, run `npm run build`, serve `dist/`
on localhost with a static server, visit once and wait for the offline status, then
switch browser DevTools to Offline. Check an unvisited mantra, a need page, a query
URL, and audio seeking. Service workers are disabled in `npm run dev`.

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
