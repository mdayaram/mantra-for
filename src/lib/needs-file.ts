import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { needSchema, type Need } from './schema';

// Astro's file() loader collapses duplicate ids before we see them, so validation reads the raw file.
export function readNeedsFile(path: string): Need[] {
  const raw = parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`needs.yaml: expected a list of needs`);
  return raw.map((entry, i) => {
    const result = needSchema.safeParse(entry);
    if (!result.success) throw new Error(`needs.yaml: entry ${i + 1} is invalid: ${result.error.message}`);
    return result.data;
  });
}
