import { describe, expect, test } from 'vite-plus/test'

import { formatDate } from './format'

// 2026-01-31T20:30:00Z is already 1 February in Asia/Almaty (UTC+5).
const LATE_EVENING_UTC = 1_769_891_400

describe('formatDate (Node ICU)', () => {
  test('formats in the platform time zone, not the host one', () => {
    expect(formatDate(LATE_EVENING_UTC, 'en')).toBe('February 1, 2026')
  })

  test('has full Kazakh month names', () => {
    expect(formatDate(LATE_EVENING_UTC, 'kk')).toBe('2026 ж. 1 ақпан')
    expect(formatDate(LATE_EVENING_UTC, 'ru')).toBe('1 февраля 2026 г.')
  })
})
