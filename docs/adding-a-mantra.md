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
