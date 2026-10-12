import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

// Inventory the final build, so new pages, recordings and hashed assets are automatic.
async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await inventory(`${directory}/${entry.name}`, `${path}/`));
    else if (path !== 'sw.js') files.push(path);
  }
  return files.sort();
}
const files = await inventory('dist');
const template = await readFile('scripts/service-worker.js', 'utf8');
const hash = createHash('sha256').update(template);
const entries = [];
for (const file of files) {
  const bytes = await readFile(`dist/${file}`);
  hash.update(file).update(bytes);
  entries.push({
    url: `/${file.replace(/(^|\/)index\.html$/, '$1')}`,
    revision: createHash('sha256').update(bytes).digest('hex'),
  });
}
await writeFile('dist/sw.js', template
  .replace('__CACHE_NAME__', JSON.stringify(`mantra-for-${hash.digest('hex').slice(0, 16)}`))
  .replace('__PRECACHE_ENTRIES__', JSON.stringify(entries)));
console.log(`PWA: precaching ${entries.length} files, including all recordings.`);
