import { describe, expect, it } from 'vitest';
import { rehypeCollapsibleSections } from '../../src/lib/rehype-collapsible';

const h = (tagName: string, text: string) => ({
  type: 'element', tagName, properties: {}, children: [{ type: 'text', value: text }],
});

describe('rehypeCollapsibleSections', () => {
  it('wraps the Notes section in details until the next h2', () => {
    const tree = { type: 'root', children: [h('h2', 'How it helps'), h('p', 'a'), h('h2', 'Notes'), h('p', 'b'), h('p', 'c'), h('h2', 'After'), h('p', 'd')] };
    rehypeCollapsibleSections({ headings: ['Notes'] })(tree as never);
    const tags = tree.children.map((c: any) => c.tagName);
    expect(tags).toEqual(['h2', 'p', 'details', 'h2', 'p']);
    const details: any = tree.children[2];
    expect(details.properties).toEqual({ className: ['collapsible'] });
    expect(details.children[0]).toMatchObject({ tagName: 'summary', children: [{ type: 'text', value: 'Notes' }] });
    expect(details.children.slice(1).map((c: any) => c.children[0].value)).toEqual(['b', 'c']);
  });

  it('leaves trees without matching headings untouched', () => {
    const tree = { type: 'root', children: [h('h2', 'How it helps'), h('p', 'a')] };
    rehypeCollapsibleSections({ headings: ['Notes'] })(tree as never);
    expect(tree.children.map((c: any) => c.tagName)).toEqual(['h2', 'p']);
  });
});
