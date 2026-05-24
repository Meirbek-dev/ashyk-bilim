import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src');

const removedFiles = [
  'features/assessments/shared/RichTextPromptEditor.tsx',
  'features/assessments/shared/MarkdownRenderer.tsx',
];

const forbiddenPatterns = [
  'features/assessments/shared/RichTextPromptEditor',
  'features/assessments/shared/MarkdownRenderer',
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(path, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

const errors = [];

for (const relative of removedFiles) {
  const path = join(root, relative);
  if (existsSync(path)) {
    errors.push(`Compatibility wrapper still exists: src/${relative}`);
  }
}

for (const path of walk(root)) {
  const source = readFileSync(path, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (source.includes(pattern)) {
      errors.push(`${path}: forbidden Markdown compatibility reference "${pattern}"`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
