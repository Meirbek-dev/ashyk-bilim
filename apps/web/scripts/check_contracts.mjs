#!/usr/bin/env node
/**
 * check_contracts.mjs
 *
 * Regenerates the API client from apps/server/openapi.v2.json into a scratch sibling of
 * src/lib/api/generated and fails on any modified, missing or extra file. The committed
 * client is the reference, so a stale commit fails and an unstaged regeneration passes.
 * (openapi.v2.json freshness against the server is `just server openapi-check`.)
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const webDir = path.resolve(import.meta.dirname, '..')
const committedDir = path.join(webDir, 'src/lib/api/generated')
const COMPAT_FILES = ['scripts/postprocess-orval-output.mjs', 'src/lib/api/generated/index.ts']
const anyCompatAlias = /type\s+Compat<[^>]+>\s*=[^\n;]*\bany\b/u

for (const relativePath of COMPAT_FILES) {
  if (anyCompatAlias.test(readFileSync(path.join(webDir, relativePath), 'utf8'))) {
    console.error(`[check:contracts] FAILED: apps/web/${relativePath} erases generated schema types with Compat<any>.`)
    process.exit(1)
  }
}

const listFiles = dir =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => statSync(path.join(dir, file)).isFile())
    .map(file => file.replaceAll('\\', '/'))

const scratchDir = mkdtempSync(path.join(webDir, 'src/lib/api/generated.check-tmp-'))
let drift
try {
  const generated = spawnSync(process.execPath, ['scripts/generate-api-types.mjs'], {
    cwd: webDir,
    env: { ...process.env, ORVAL_OUTPUT_DIR: path.relative(webDir, scratchDir).replaceAll('\\', '/') },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (generated.status !== 0) {
    console.error('[check:contracts] FAILED: `bun run generate:contracts` did not run (output above).')
    process.exit(1)
  }
  drift = [...new Set([...listFiles(committedDir), ...listFiles(scratchDir)])].filter(file => {
    const committed = path.join(committedDir, file)
    const regenerated = path.join(scratchDir, file)
    return (
      !existsSync(committed) || !existsSync(regenerated) || !readFileSync(committed).equals(readFileSync(regenerated))
    )
  })
} finally {
  rmSync(scratchDir, { recursive: true, force: true })
}

if (drift.length > 0) {
  console.error(
    `[check:contracts] FAILED: ${drift.length} generated file(s) differ from apps/server/openapi.v2.json:\n` +
      drift
        .slice(0, 30)
        .map(file => `  apps/web/src/lib/api/generated/${file}`)
        .join('\n') +
      '\nRun `bun run generate:contracts` in apps/web, then commit the updated files.',
  )
  process.exit(1)
}
console.log('Contract check passed: generated API client matches openapi.v2.json.')
