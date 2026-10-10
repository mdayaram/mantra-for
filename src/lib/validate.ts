import { ID_PATTERN, type MantraData, type Need } from './schema';

export interface CatalogInput {
  mantras: { id: string; data: MantraData }[];
  needs: Need[];
  audioFiles: string[];
}

export function validateCatalog({ mantras, needs, audioFiles }: CatalogInput): string[] {
  const errors: string[] = [];
  const needIds = new Set<string>();
  for (const need of needs) {
    if (needIds.has(need.id)) errors.push(`needs.yaml: duplicate need id "${need.id}"`);
    needIds.add(need.id);
  }
  const audio = new Set(audioFiles);
  for (const { id, data } of mantras) {
    if (!ID_PATTERN.test(id)) errors.push(`${id}: id must be kebab-case (rename the file)`);
    for (const n of data.needs) {
      if (!needIds.has(n)) errors.push(`${id}: unknown need "${n}" (add it to content/needs.yaml)`);
    }
    if (data.audio && !audio.has(data.audio.file)) {
      errors.push(`${id}: audio file "${data.audio.file}" not found in public/audio/`);
    }
  }
  return errors;
}
