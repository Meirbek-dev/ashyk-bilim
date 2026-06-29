#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { findBunStoreFile } from './package-tooling.mjs'

const openapiTypescriptCli = findBunStoreFile('openapi-typescript@', 'node_modules/openapi-typescript/bin/cli.js')
const loaderPath = path.join(import.meta.dirname, 'typescript-compat-loader.mjs')
const schemaPath = path.resolve(import.meta.dirname, '..', 'src/lib/api/generated/schema.ts')

function dedupeGeneratedStringLiteralUnions(source) {
  return source.replace(/\(([^()]*(?:'[^'\n]+'|"[^"\n]+")[^()]*)\)\s*\|\s*\(([^()]*)\)/g, (match, left, right) => {
    const literals = [...`${left}\n${right}`.matchAll(/['"]([^'"\n]+)['"]/g)].map(([, literal]) => `'${literal}'`)
    if (literals.length === 0) return match

    return `(${[...new Set(literals)].join(' | ')})`
  })
}

const result = spawnSync(
  process.execPath,
  [
    '--loader',
    pathToFileURL(loaderPath).href,
    openapiTypescriptCli,
    '../api/openapi.json',
    '-o',
    'src/lib/api/generated/schema.ts',
  ],
  {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  },
)

if (result.error) {
  throw result.error
}

if (result.status === 0) {
  const source = readFileSync(schemaPath, 'utf8')
  const normalized = dedupeGeneratedStringLiteralUnions(source)
  if (normalized !== source) {
    writeFileSync(schemaPath, normalized)
  }
}

process.exit(result.status ?? 1)
