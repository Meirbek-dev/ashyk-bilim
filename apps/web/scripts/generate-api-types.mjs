#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const result = spawnSync('bunx', ['orval', '--config', 'orval.config.ts'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
