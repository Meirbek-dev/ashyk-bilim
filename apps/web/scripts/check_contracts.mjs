#!/usr/bin/env node
/**
 * check_contracts.mjs
 *
 * Verifies that the generated API schema matches the committed artifact.
 * Run after `bun run generate:contracts` to catch uncommitted drifts in CI.
 *
 * Exit 0 → schema is up-to-date.
 * Exit 1 → generated schema differs from what is committed; regenerate and commit.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Run from the monorepo root so git diff paths resolve correctly.
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const TRACKED_FILES = [
  'apps/api/openapi.json',
  'apps/web/src/lib/api/generated/schema.ts',
];

try {
  execSync(`git diff --exit-code -- ${TRACKED_FILES.join(' ')}`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  console.log('Contract check passed: generated schema is up-to-date.');
} catch {
  console.error(
    '\n[check:contracts] FAILED — the generated schema differs from the committed version.\n' +
    'Run `bun run generate:contracts` at the repo root, then commit the updated files.\n',
  );
  process.exit(1);
}
