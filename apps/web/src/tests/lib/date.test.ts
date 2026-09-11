import { describe, expect, it } from 'vite-plus/test'

import { formatDate } from '@/lib/date'

// BUG-024: the kz landing badge rendered the raw ICU skeleton "2026 M09 11".
describe('formatDate', () => {
  it('composes Kazakh dates from month names instead of the ICU skeleton', () => {
    const out = formatDate('2026-09-11T00:00:00Z', 'kk-KZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    expect(out).toBe('11 қыр. 2026 ж.')
    expect(out).not.toMatch(/M\d\d/)
  })

  it('defers to Intl for ru/en and blanks invalid input', () => {
    expect(formatDate('2026-09-11T00:00:00Z', 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })).toBe(
      '11 сент. 2026 г.',
    )
    expect(formatDate('not a date', 'kk-KZ')).toBe('')
  })
})
