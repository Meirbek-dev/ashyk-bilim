#!/usr/bin/env node
/**
 * Regenerates the typed API client from `apps/server/openapi.v2.json`
 * (the contract artifact exported by `ashyq openapi`).
 *
 *   bun run generate:api-types
 *
 * Steps: Orval (react-query hooks + zod schemas, see orval.config.ts and
 * scripts/orval-input-transformer.mjs) → parser injection
 * (scripts/postprocess-orval-output.mjs) → formatter → parser injection again
 * (the formatter can re-wrap call sites).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const webDir = path.resolve(import.meta.dirname, '..')
const repoDir = path.resolve(webDir, '../..')

const waitForWindowsFileHandles = async () => {
  if (process.platform === 'win32') {
    await delay(2_000)
  }
}

function run(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit', shell })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('bunx', ['orval', '--config', 'orval.config.ts'], webDir, process.platform === 'win32')
await waitForWindowsFileHandles()

run(process.execPath, ['scripts/postprocess-orval-output.mjs'], webDir)
await waitForWindowsFileHandles()

run('vp', ['fmt', '--write', 'apps/web/src/lib/api/generated'], repoDir, process.platform === 'win32')
await waitForWindowsFileHandles()

run(process.execPath, ['scripts/postprocess-orval-output.mjs'], webDir)
