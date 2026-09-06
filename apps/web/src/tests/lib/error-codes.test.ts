import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

import { findMissing, readErrorCodes } from '../../../scripts/sync-error-codes.mjs'
import enUS from '@/messages/en-US.json'
import kkKZ from '@/messages/kk-KZ.json'
import ruRU from '@/messages/ru-RU.json'

const specPath = path.resolve(__dirname, '../../../../server/openapi.v2.json')

/**
 * Every code in the server's closed ErrorCode registry must have a message in
 * each locale (ARCHITECTURE §5: "a web-side test fails if a code lacks
 * translations").
 */
describe('error-code catalogs', () => {
  const codes = readErrorCodes(JSON.parse(readFileSync(specPath, 'utf8')))

  it('reads the registry from the contract', () => {
    expect(codes).toContain('not-found')
    expect(codes).toContain('validation-failed')
  })

  it.each([
    ['ru-RU', ruRU],
    ['kk-KZ', kkKZ],
    ['en-US', enUS],
  ])('%s has a message for every code', (_locale, catalog) => {
    expect(findMissing(catalog, codes)).toEqual([])
  })
})
