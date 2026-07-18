#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const waitForWindowsFileHandles = async () => {
  if (process.platform === 'win32') {
    await delay(500)
  }
}

const result = spawnSync('bunx', ['orval', '--config', 'orval.config.ts'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

await waitForWindowsFileHandles()

const postprocess = spawnSync(process.execPath, ['scripts/postprocess-orval-output.mjs'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'inherit',
})

if (postprocess.error) {
  throw postprocess.error
}

if (postprocess.status !== 0) {
  process.exit(postprocess.status ?? 1)
}

await waitForWindowsFileHandles()

const format = spawnSync('vp', ['fmt', '--write', 'apps/web', 'apps/api/openapi.json'], {
  cwd: path.resolve(import.meta.dirname, '../../..'),
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (format.error) {
  throw format.error
}

if (format.status !== 0) {
  process.exit(format.status ?? 1)
}

await waitForWindowsFileHandles()

const finalize = spawnSync(process.execPath, ['scripts/postprocess-orval-output.mjs'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'inherit',
})

if (finalize.error) {
  throw finalize.error
}

process.exit(finalize.status ?? 1)
