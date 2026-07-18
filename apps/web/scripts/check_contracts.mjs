#!/usr/bin/env node
/**
 * check_contracts.mjs
 *
 * Verifies that the generated API client matches the committed artifact.
 * Run after `bun run generate:contracts` to catch uncommitted drifts in CI.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..', '..')

const TRACKED_FILES = ['apps/api/openapi.json', 'apps/web/src/lib/api/generated']
const COMPAT_FILES = ['apps/web/scripts/postprocess-orval-output.mjs', 'apps/web/src/lib/api/generated/index.ts']
const anyCompatAlias = /type\s+Compat<[^>]+>\s*=[^\n;]*\bany\b/u

for (const relativePath of COMPAT_FILES) {
  if (anyCompatAlias.test(readFileSync(path.join(repoRoot, relativePath), 'utf8'))) {
    console.error(`[check:contracts] FAILED: ${relativePath} erases generated schema types with Compat<any>.`)
    process.exit(1)
  }
}

try {
  execSync(`git diff --exit-code -- ${TRACKED_FILES.join(' ')}`, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  console.log('Contract check passed: generated API client is up-to-date.')
} catch {
  console.error(
    '\n[check:contracts] FAILED: the generated API client differs from the committed version.\n' +
      'Run `bun run generate:contracts` at the repo root, then commit the updated files.\n',
  )
  process.exit(1)
}
