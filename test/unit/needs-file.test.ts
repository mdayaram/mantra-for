import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNeedsFile } from '../../src/lib/needs-file';
import { validateCatalog } from '../../src/lib/validate';

function tempYaml(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'needs-')), 'needs.yaml');
  writeFileSync(path, text);
  return path;
}

describe('readNeedsFile', () => {
  it('keeps duplicate ids so validation can reject them', () => {
    const needs = readNeedsFile(tempYaml('- { id: peace, label: Peace }\n- { id: peace, label: Peace again }\n'));
    expect(needs.map((n) => n.id)).toEqual(['peace', 'peace']);
    expect(validateCatalog({ mantras: [], needs, audioFiles: [] })).toEqual(['needs.yaml: duplicate need id "peace"']);
  });

  it('applies the need schema', () => {
    expect(readNeedsFile(tempYaml('- { id: peace, label: Peace }\n'))).toEqual([{ id: 'peace', label: 'Peace', synonyms: [] }]);
    expect(() => readNeedsFile(tempYaml('- { id: Bad Id, label: x }\n'))).toThrow(/needs\.yaml/);
  });
});
