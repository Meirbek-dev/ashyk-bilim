import { describe, expect, test } from 'vite-plus/test'

import { formatDate } from './format'

const LATE_EVENING_UTC = 1_769_891_400

describe('formatDate (Chromium ICU)', () => {
  test('matches the server output for kk, so SSR and hydration agree', () => {
    expect(formatDate(LATE_EVENING_UTC, 'kk')).toBe('2026 ж. 1 ақпан')
  })
})
