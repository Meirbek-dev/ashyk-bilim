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
 *
 * Safe while `next dev` runs: everything is generated into a scratch sibling of
 * src/lib/api/generated, then only changed files are moved over (by rename) and
 * stale ones removed, so the dev server never reads a half-written module.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const webDir = path.resolve(import.meta.dirname, '..')
const target = 'src/lib/api/generated'
// ORVAL_OUTPUT_DIR (relative to apps/web): check:contracts writes a scratch copy and publishes nothing.
const scratch =
  process.env.ORVAL_OUTPUT_DIR ??
  path.relative(webDir, mkdtempSync(path.join(webDir, `${target}.codegen-tmp-`))).replaceAll('\\', '/')
const env = { ...process.env, ORVAL_OUTPUT_DIR: scratch }

const waitForWindowsFileHandles = async () => {
  if (process.platform === 'win32') {
    await delay(2_000)
  }
}

function run(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const filesIn = dir =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(file => statSync(path.join(dir, file)).isFile())

/** renameSync over a file another process may be reading (Windows answers EPERM/EBUSY for a moment). */
async function replaceFile(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      if (attempt >= 40 || !['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) throw error
      await delay(50)
    }
  }
}

/** Moves changed files from `from` onto `to`, removes the ones no longer generated; returns the count. */
async function publish(from, to) {
  const fresh = new Set(filesIn(from))
  let changed = 0
  for (const file of fresh) {
    const dest = path.join(to, file)
    if (existsSync(dest) && readFileSync(dest).equals(readFileSync(path.join(from, file)))) continue
    mkdirSync(path.dirname(dest), { recursive: true })
    await replaceFile(path.join(from, file), dest)
    changed++
  }
  for (const file of existsSync(to) ? filesIn(to) : []) {
    if (fresh.has(file)) continue
    rmSync(path.join(to, file))
    changed++
  }
  return changed
}

try {
  run('bunx', ['orval', '--config', 'orval.config.ts'], webDir, process.platform === 'win32')
  await waitForWindowsFileHandles()

  run(process.execPath, ['scripts/postprocess-orval-output.mjs'], webDir)
  await waitForWindowsFileHandles()

  // Run from apps/web so vp picks up the web format config.
  run('vp', ['fmt', '--write', scratch], webDir, process.platform === 'win32')
  await waitForWindowsFileHandles()

  run(process.execPath, ['scripts/postprocess-orval-output.mjs'], webDir)

  if (!process.env.ORVAL_OUTPUT_DIR) {
    const changed = await publish(path.join(webDir, scratch), path.join(webDir, target))
    console.log(`generate:api-types: ${changed} files changed in ${target}`)
  }
} finally {
  if (!process.env.ORVAL_OUTPUT_DIR) rmSync(path.join(webDir, scratch), { recursive: true, force: true })
}
