#!/usr/bin/env node
/**
 * Error-code i18n sync (ARCHITECTURE §5, EXECUTION-PLAN 9.3).
 *
 * The server's closed `ErrorCode` registry is published in
 * `apps/server/openapi.v2.json` (`components.schemas.ErrorCode.enum`). Every
 * code must have a user-facing message in each locale catalog under
 * `Errors.codes.<code>`; the UI looks messages up by code (useApiError).
 *
 *   node scripts/sync-error-codes.mjs          # verify, exit 1 on gaps
 *   node scripts/sync-error-codes.mjs --write  # add missing keys as TODO placeholders
 *
 * Run by `bun run check:error-codes` and by the vitest suite
 * (src/tests/lib/error-codes.test.ts).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const webDir = path.resolve(import.meta.dirname, '..')
const specPath = path.resolve(webDir, '../server/openapi.v2.json')
const LOCALES = ['ru-RU', 'kk-KZ', 'en-US']
const PLACEHOLDER_PREFIX = 'TODO:'

export function readErrorCodes(spec = JSON.parse(readFileSync(specPath, 'utf8'))) {
  const codes = spec?.components?.schemas?.ErrorCode?.enum
  if (!Array.isArray(codes) || codes.length === 0) {
    throw new Error(`No ErrorCode enum found in ${specPath}`)
  }
  return codes
}

export function findMissing(catalog, codes) {
  const messages = catalog?.Errors?.codes ?? {}
  return codes.filter(code => {
    const value = messages[code]
    return typeof value !== 'string' || value.trim() === '' || value.startsWith(PLACEHOLDER_PREFIX)
  })
}

function catalogPath(locale) {
  return path.join(webDir, 'src/messages', `${locale}.json`)
}

function main() {
  const write = process.argv.includes('--write')
  const codes = readErrorCodes()
  let failed = false

  for (const locale of LOCALES) {
    const file = catalogPath(locale)
    const catalog = JSON.parse(readFileSync(file, 'utf8'))
    const missing = findMissing(catalog, codes)
    const stale = Object.keys(catalog?.Errors?.codes ?? {}).filter(code => !codes.includes(code))

    if (stale.length > 0) {
      console.warn(`[error-codes] ${locale}: unknown codes not in the registry: ${stale.join(', ')}`)
    }

    if (missing.length === 0) {
      console.log(`[error-codes] ${locale}: ${codes.length}/${codes.length} codes translated`)
      continue
    }

    if (write) {
      catalog.Errors ??= {}
      catalog.Errors.codes ??= {}
      for (const code of missing) {
        catalog.Errors.codes[code] = `${PLACEHOLDER_PREFIX} ${code}`
      }
      writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`)
      console.log(`[error-codes] ${locale}: added ${missing.length} placeholder(s): ${missing.join(', ')}`)
      failed = true
      continue
    }

    console.error(`[error-codes] ${locale}: missing messages for ${missing.length} code(s): ${missing.join(', ')}`)
    failed = true
  }

  if (failed) {
    console.error('[error-codes] catalogs are out of sync with apps/server/openapi.v2.json')
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main()
}
