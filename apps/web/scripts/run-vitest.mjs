#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const vitestPackagePath = require.resolve('vitest/package.json')
const vitestPackage = require(vitestPackagePath)
const vitestBin = path.resolve(path.dirname(vitestPackagePath), vitestPackage.bin.vitest)

const result = spawnSync(
  process.execPath,
  ['--env-file-if-exists=.env', '--env-file-if-exists=.env.local', vitestBin, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
)

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
