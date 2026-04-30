/* global console, process */

import { readdir } from 'node:fs/promises';
import path from 'node:path';

const roots = ['app', 'features'];
const empty = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.length === 0) {
    empty.push(dir);
    return;
  }
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => walk(path.join(dir, entry.name))));
}

await Promise.all(roots.map((root) => walk(root)));

if (empty.length > 0) {
  console.error(empty.map((dir) => `EMPTY: ${dir}`).join('\n'));
  process.exit(1);
}
