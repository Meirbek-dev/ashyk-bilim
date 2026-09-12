import { describe, expect, it } from 'vite-plus/test'

import { needsKkIntlPolyfill } from '@/i18n/intl-polyfill'

/** An `Intl` that formats kk like the root locale (Playwright's Chromium). */
const rootOnlyIntl = {
  DateTimeFormat: class {
    format = () => 'M09'
  },
  NumberFormat: class {
    format = () => '1,234.5'
  },
} as unknown as typeof Intl

describe('needsKkIntlPolyfill', () => {
  it('is false outside kk, whatever the runtime does', () => {
    expect(needsKkIntlPolyfill('ru-RU', rootOnlyIntl)).toBe(false)
    expect(needsKkIntlPolyfill('en-US', rootOnlyIntl)).toBe(false)
  })

  it('is false when the runtime has kk data (Node full-icu)', () => {
    expect(needsKkIntlPolyfill('kk-KZ')).toBe(false)
  })

  it('is true when months come out as ICU skeletons or numbers group with commas', () => {
    expect(needsKkIntlPolyfill('kk-KZ', rootOnlyIntl)).toBe(true)
    const numbersOnly = { ...rootOnlyIntl, DateTimeFormat: Intl.DateTimeFormat } as typeof Intl
    expect(needsKkIntlPolyfill('kk-KZ', numbersOnly)).toBe(true)
  })
})
