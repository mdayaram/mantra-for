import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { mantraSchema, needSchema } from './lib/schema';

const mantras = defineCollection({
  loader: glob({ base: './content/mantras', pattern: '[^_]*.md' }),
  schema: mantraSchema,
});

const needs = defineCollection({
  loader: file('./content/needs.yaml'),
  schema: needSchema,
});

export const collections = { mantras, needs };
