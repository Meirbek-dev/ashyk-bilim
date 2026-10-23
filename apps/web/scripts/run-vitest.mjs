#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const vitePlusPackagePath = require.resolve('vite-plus/package.json')
const vitePlusPackage = require(vitePlusPackagePath)
const vitePlusBin = path.resolve(path.dirname(vitePlusPackagePath), vitePlusPackage.bin.vp)

const result = spawnSync(
  process.execPath,
  ['--env-file-if-exists=.env', '--env-file-if-exists=.env.local', vitePlusBin, 'test', ...process.argv.slice(2)],
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
