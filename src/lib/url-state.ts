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
