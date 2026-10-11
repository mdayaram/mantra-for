import { keywordRank, type Scored } from '../lib/keyword';
import type { SearchIndex } from '../lib/search-index';
import { parseState, stateToSearch, type UrlState } from '../lib/url-state';

let indexPromise: Promise<SearchIndex> | undefined;
const loadIndex = () => (indexPromise ??= fetch('/search-index.json').then((r) => {
  if (!r.ok) throw new Error(`search index ${r.status}`);
  return r.json() as Promise<SearchIndex>;
}).catch((error) => {
  indexPromise = undefined;
  throw error;
}));

async function search(q: string): Promise<Scored[]> {
  try {
    if (!navigator.onLine) throw new Error('offline');
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(4000) });
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
      show(ids, ids.length ? `For ${label ?? state.need}` : 'No mantras for that yet — try another feeling above.');
    } else {
      input.value = state.q;
      status.textContent = 'Searching…';
      status.hidden = false;
      let results: Scored[];
      try {
        results = await search(state.q);
      } catch {
        if (run === generation) show(null, 'Search is unavailable. Browse the mantras or pick a feeling above.');
        return;
      }
      if (run !== generation) return; // a newer navigation superseded this one
      const ids = results.map((r) => r.id);
      show(ids, ids.length ? `${ids.length} for “${state.q}”` : 'Nothing matched — try different words, or pick a feeling above.');
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
