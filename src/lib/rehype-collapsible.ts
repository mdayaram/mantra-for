interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

function textOf(node: Node): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

const isSectionBreak = (n: Node) => n.type === 'element' && (n.tagName === 'h1' || n.tagName === 'h2');

export function rehypeCollapsibleSections({ headings }: { headings: string[] }) {
  const wanted = new Set(headings.map((h) => h.trim().toLowerCase()));
  return (tree: Node) => {
    const out: Node[] = [];
    const children = tree.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.tagName !== 'h2' || !wanted.has(textOf(node).trim().toLowerCase())) {
        out.push(node);
        continue;
      }
      const body: Node[] = [];
      while (i + 1 < children.length && !isSectionBreak(children[i + 1])) body.push(children[++i]);
      out.push({
        type: 'element',
        tagName: 'details',
        properties: { className: ['collapsible'] },
        children: [{ type: 'element', tagName: 'summary', properties: {}, children: node.children ?? [] }, ...body],
      });
    }
    tree.children = out;
  };
}
