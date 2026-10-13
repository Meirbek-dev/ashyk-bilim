import { createFormatter } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { formatTimeZone } from '@/i18n/config'

// 2026-10-13T19:30:00Z: 00:30 on the 14th at UTC+5, 01:30 at the pre-2024 UTC+6.
const EVENING = new Date(Date.UTC(2026, 9, 13, 19, 30))

const stamp = () =>
  createFormatter({ locale: 'ru-RU', timeZone: formatTimeZone }).dateTime(EVENING, {
    dateStyle: 'long',
    timeStyle: 'short',
  })

describe('formatTimeZone', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is the platform offset, UTC+5', () => {
    expect(stamp()).toBe('14 октября 2026 г. в 00:30')
  })

  it('formats the same where the tzdata still puts Asia/Almaty at UTC+6 (Linux WebKit, older iOS)', () => {
    const fresh = stamp()
    class Stale extends Intl.DateTimeFormat {
      constructor(locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
        super(locales, options?.timeZone === 'Asia/Almaty' ? { ...options, timeZone: 'Etc/GMT-6' } : options)
      }
    }
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(Stale as unknown as typeof Intl.DateTimeFormat)
    expect(stamp()).toBe(fresh)
  })
})
