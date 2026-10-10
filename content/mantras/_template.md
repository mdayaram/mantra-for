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
