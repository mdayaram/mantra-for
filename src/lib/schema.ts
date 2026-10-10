import { z } from 'astro/zod';

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const needSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  label: z.string().min(1),
  synonyms: z.array(z.string()).default([]),
});

export const mantraSchema = z.strictObject({
  name: z.string().min(1),
  sanskrit: z.string().trim().min(1),
  transliteration: z.string().optional(),
  translations: z.array(z.object({ label: z.string(), text: z.string() })).default([]),
  word_meanings: z
    .array(z.object({ sanskrit: z.string(), iast: z.string(), meaning: z.string() }))
    .default([]),
  source: z.string().optional(),
  needs: z.array(z.string()).min(1),
  summary: z.string().min(1),
  audio: z
    .object({
      file: z.string(),
      credit: z.string().optional(),
      url: z.url().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export type Need = z.infer<typeof needSchema>;
export type MantraData = z.infer<typeof mantraSchema>;
