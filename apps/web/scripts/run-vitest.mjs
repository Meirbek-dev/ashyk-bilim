#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

import { findBunStoreFile } from './package-tooling.mjs'

const vitestEntry = findBunStoreFile(
  '@voidzero-dev+vite-plus-test@',
  'node_modules/@voidzero-dev/vite-plus-test/vitest.mjs',
)

const result = spawnSync(process.execPath, [vitestEntry, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
