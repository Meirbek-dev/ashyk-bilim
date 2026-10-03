import { describe, expect, test } from 'vite-plus/test'

import { formatDate, formatDateTime, formatDayMonth, formatPercent, fromDateTimeInput, toDateTimeInput } from './format'

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

describe('formatDayMonth and formatPercent', () => {
  test('a day and month in the platform zone, kk from the month table', () => {
    expect(formatDayMonth(LATE_EVENING_UTC, 'en')).toBe('Feb 1')
    expect(formatDayMonth(LATE_EVENING_UTC, 'kk')).toBe('1 ақпан')
  })

  test('a 0..100 share as a percent', () => {
    expect(formatPercent(42.5, 'en')).toBe('42.5%')
    expect(formatPercent(42.5, 'kk')).toBe(formatPercent(42.5, 'ru'))
  })
})

describe('date and time in the platform zone', () => {
  test('the time of day follows the date', () => {
    expect(formatDateTime(LATE_EVENING_UTC, 'en')).toBe('February 1, 2026, 01:30')
    expect(formatDateTime(LATE_EVENING_UTC, 'kk')).toBe('2026 ж. 1 ақпан, 01:30')
  })

  test('a datetime-local value round-trips through the platform zone, not the host one', () => {
    expect(toDateTimeInput(LATE_EVENING_UTC)).toBe('2026-02-01T01:30')
    expect(fromDateTimeInput('2026-02-01T01:30')).toBe(LATE_EVENING_UTC)
  })
})
