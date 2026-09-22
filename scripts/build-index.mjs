import { readdir, writeFile } from 'node:fs/promises';

const files = await readdir('data/daily');
const dates = files
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map((f) => f.replace('.json',''))
  .sort();

await writeFile(
  'data/daily/index.json',
  JSON.stringify({ dates }, null, 2) + '\n',
  'utf8'
);

console.log(`Generated daily index: ${dates.length} editions`);
