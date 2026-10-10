import { describe, expect, it } from 'vitest';
import { parseState, stateToSearch } from '../../src/lib/url-state';

describe('parseState', () => {
  it('parses all, need, and query states', () => {
    expect(parseState('')).toEqual({ kind: 'all' });
    expect(parseState('?need=sadness')).toEqual({ kind: 'need', need: 'sadness' });
    expect(parseState('?q=I%20feel%20lost')).toEqual({ kind: 'query', q: 'I feel lost' });
  });
  it('treats blank values as all and prefers q over need', () => {
    expect(parseState('?q=')).toEqual({ kind: 'all' });
    expect(parseState('?q=%20%20&need=')).toEqual({ kind: 'all' });
    expect(parseState('?need=fear&q=dread')).toEqual({ kind: 'query', q: 'dread' });
  });
  it('passes unknown need ids through (caller shows empty state)', () => {
    expect(parseState('?need=unknown')).toEqual({ kind: 'need', need: 'unknown' });
  });
});

describe('stateToSearch', () => {
  it('round-trips', () => {
    for (const s of ['', '?need=sadness', '?q=I+feel+lost']) {
      expect(stateToSearch(parseState(s))).toBe(s);
    }
  });
});
