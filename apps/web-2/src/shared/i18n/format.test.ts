import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import {
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatFileSize,
  formatPercent,
  fromDateTimeInput,
  toDateTimeInput,
} from './format'

// 2026-01-31T20:30:00Z is already 1 February in Asia/Almaty (UTC+5).
const LATE_EVENING_UTC = 1_769_891_400

// The dates below fall in another year than "now", so they print it; a date of this year drops it.
const NEXT_YEAR = new Date('2027-06-01T00:00:00Z')

describe('formatDate (Node ICU)', () => {
  beforeEach(() => vi.useFakeTimers({ now: NEXT_YEAR, toFake: ['Date'] }))
  afterEach(() => vi.useRealTimers())

  test('formats in the platform time zone, not the host one', () => {
    expect(formatDate(LATE_EVENING_UTC, 'en')).toBe('February 1, 2026')
  })

  test('has full Kazakh month names', () => {
    expect(formatDate(LATE_EVENING_UTC, 'kk')).toBe('2026 ж. 1 ақпан')
    expect(formatDate(LATE_EVENING_UTC, 'ru')).toBe('1 февраля 2026 г.')
  })

  test('a date of this year (on the platform calendar) has no year unless asked for', () => {
    vi.setSystemTime(new Date('2026-12-31T18:59:00Z')) // still 2026 at UTC+5
    expect(formatDate(LATE_EVENING_UTC, 'ru')).toBe('1 февраля')
    expect(formatDate(LATE_EVENING_UTC, 'en')).toBe('February 1')
    expect(formatDate(LATE_EVENING_UTC, 'kk')).toBe('1 ақпан')
    expect(formatDateTime(LATE_EVENING_UTC, 'ru')).toBe('1 февраля, 01:30')
    expect(formatDate(LATE_EVENING_UTC, 'ru', { withYear: true })).toBe('1 февраля 2026 г.')
    vi.setSystemTime(new Date('2026-12-31T19:00:00Z')) // 1 January 2027 at UTC+5
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
  beforeEach(() => vi.useFakeTimers({ now: NEXT_YEAR, toFake: ['Date'] }))
  afterEach(() => vi.useRealTimers())

  test('the time of day follows the date', () => {
    expect(formatDateTime(LATE_EVENING_UTC, 'en')).toBe('February 1, 2026, 01:30')
    expect(formatDateTime(LATE_EVENING_UTC, 'kk')).toBe('2026 ж. 1 ақпан, 01:30')
  })

  test('a datetime-local value round-trips through the platform zone, not the host one', () => {
    expect(toDateTimeInput(LATE_EVENING_UTC)).toBe('2026-02-01T01:30')
    expect(fromDateTimeInput('2026-02-01T01:30')).toBe(LATE_EVENING_UTC)
  })
})

describe('formatFileSize', () => {
  test('the largest fitting unit, one decimal at most', () => {
    expect(formatFileSize(2048 * 1024 * 1024, 'en')).toBe('2 GB')
    expect(formatFileSize(10 * 1024 * 1024, 'en')).toBe('10 MB')
    expect(formatFileSize(1536, 'en')).toBe('1.5 kB')
    expect(formatFileSize(12, 'en')).toBe('12 byte')
    expect(formatFileSize(450.5 * 1024 * 1024, 'ru')).toBe('450,5 МБ')
    expect(formatFileSize(2048 * 1024 * 1024, 'kk')).toBe(formatFileSize(2048 * 1024 * 1024, 'ru'))
  })
})

describe('independent of the runtime tzdata', () => {
  beforeEach(() => vi.useFakeTimers({ now: NEXT_YEAR, toFake: ['Date'] }))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // 2026-10-13T19:30:00Z: 00:30 on the 14th at UTC+5, 01:30 at the pre-2024 UTC+6.
  const EVENING = 1_791_919_800

  test('a browser that still puts Asia/Almaty at UTC+6 renders what the server renders', () => {
    const fresh = [formatDateTime(EVENING, 'ru'), formatDayMonth(EVENING, 'en'), formatDate(EVENING, 'kk')]
    expect(fresh).toEqual(['14 октября 2026 г., 00:30', 'Oct 14', '2026 ж. 14 қазан'])
    // Linux WebKit (system ICU 74) and older iOS: tzdata before 2024a.
    const Real = Intl.DateTimeFormat
    // A function, not an arrow: the code under test calls it with `new`.
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function stale(locales, options) {
      return new Real(locales, options?.timeZone === 'Asia/Almaty' ? { ...options, timeZone: 'Etc/GMT-6' } : options)
    })
    expect([formatDateTime(EVENING, 'ru'), formatDayMonth(EVENING, 'en'), formatDate(EVENING, 'kk')]).toEqual(fresh)
    expect(toDateTimeInput(EVENING)).toBe('2026-10-14T00:30')
    expect(fromDateTimeInput('2026-10-14T00:30')).toBe(EVENING)
  })
})
