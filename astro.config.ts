import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import { rehypeCollapsibleSections } from './src/lib/rehype-collapsible';

export default defineConfig({
  output: 'static',
  build: { format: 'directory' },
  markdown: {
    processor: unified({
      rehypePlugins: [[rehypeCollapsibleSections, { headings: ['Notes'] }]],
    }),
  },
});
