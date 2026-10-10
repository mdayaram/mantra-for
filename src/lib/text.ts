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
