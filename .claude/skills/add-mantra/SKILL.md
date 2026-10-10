---
name: add-mantra
description: Use when the owner asks to add a new mantra, prayer, śloka, stotra, or meditation to the mantra-for site, usually supplying the Sanskrit and asking you to find the translation, meanings, recording, and context.
---

# Add a mantra

The owner's Sanskrit is the source of truth; everything else is researched, drafted, and **approved by the owner before any file is written**. Field reference and writing guidance: `docs/adding-a-mantra.md`. Template: `content/mantras/_template.md`.

## Workflow

1. **Read** `docs/adding-a-mantra.md`, `content/needs.yaml`, and one existing entry in `content/mantras/` for tone.
2. **Research** (web search, several sources):
   - IAST and word meanings — cross-check at least two sources; write the glosses yourself.
   - How and when it is recited, and what it is for.
   - Textual source. If sources disagree or none cites a specific passage, write "textual origin uncertain" and say so in Notes — never repeat an unverified attribution as fact.
   - Variant readings, so you can tell whether a recording matches the owner's text.
3. **Translation**: write your own literal translation (label `Literal translation`). Use a published one only if the owner asks, with the translator credited.
4. **Recording** — see Audio rules below. Download candidates to the scratchpad (never into the repo yet). Time-box it: about 15 minutes or 5 candidates, then fall back to no audio.
5. **Needs**: pick 2–4 existing ids from `content/needs.yaml`. Propose a new need only if none fits, and ask.
6. **Draft for approval**: show the complete `content/mantras/<id>.md` exactly as it would be written, then the open questions (translation, needs, recording and its license — or why there is none — and anything uncertain). **STOP until the owner approves.** Apply their edits verbatim.
7. **Write** the file; copy approved audio to `public/audio/<id>.mp3`.
8. **Verify**: `npm test`, `npm run build`, then `npm run preview` and query `/api/search?q=` with 2–3 phrasings of the need — the new entry should rank first for at least one. Stop the dev server.
9. **Ship** (default): branch `add-<id>`, commit, push, `gh pr create`. PR body: what the mantra is, sources used, source/origin stance, recording + license + link, test and search-ranking results. Push straight to `main` only if the owner says so.

## Audio rules

| Rule | Why |
|---|---|
| Prefer Internet Archive (`archive.org/advancedsearch.php` with `licenseurl`) or Wikimedia Commons | License is recorded per item |
| Require an explicit reuse license (CC BY / BY-SA / BY-NC / PD; BY-ND only if used unedited); record it in `audio.credit` | The site redistributes the file |
| Treat as weak: YouTube "CC BY" flags, music with backing tracks, and PD marks a third party put on a modern commercial album | The uploader may not hold the rights |
| Confirm the recording recites the **owner's reading**, not a variant | Common verses have swapped-word variants |
| Verify by transcribing (e.g. `uvx --from faster-whisper` on audio decoded with `ffmpeg`); if you can't verify, ask the owner to listen | You can't listen yourself |
| Skip compilations longer than ~10 min unless a track list shows the verse | Scanning them is slow and open-ended |
| Verify the file decodes (`afinfo` / `ffprobe`) and note duration | Truncated downloads happen |
| Use the file unedited when possible; if you trim, say exactly what in `audio.notes` | Provenance |
| No acceptable recording → omit the `audio` block and explain why in your questions | Audio is optional |

## Common mistakes

- Writing files before the owner has approved the draft.
- Normalizing or "correcting" the owner's Sanskrit — keep it exactly (dropping trailing dandas to match other entries is fine; mention it).
- Copying a translation from a website.
- Over-tagging needs (it makes chips and search noisier).
- Forgetting the search-ranking check, or leaving `wrangler dev` running.
