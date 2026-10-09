// The catalogs are in the inlang (Paraglide) format since 34d8cd2; next-intl rejected every plural /
// date message ("resolved to an array") and showed the raw key. `inlangToIcu` converts at load time.
import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vite-plus/test'

import { inlangToIcu } from '@/i18n/inlang-to-icu'
import enMessages from '@/messages/en-US.json'
import kkMessages from '@/messages/kk-KZ.json'
import ruMessages from '@/messages/ru-RU.json'

const translator = (locale: string, raw: unknown, errors: string[] = []) =>
  createTranslator({
    locale,
    messages: inlangToIcu(raw) as Record<string, string>,
    timeZone: 'Asia/Almaty',
    onError: error => errors.push(error.message),
  }) as unknown as {
    (key: string, values?: Record<string, unknown>): string
    rich: (key: string, values?: Record<string, unknown>) => unknown
  }

describe('inlangToIcu', () => {
  it('renders ru plurals with exact-match variants', () => {
    const t = translator('ru-RU', ruMessages)
    expect(t('Activities.ExamActivity.points', { count: 0 })).toBe('0 баллов')
    expect(t('Activities.ExamActivity.points', { count: 1 })).toBe('1 балл')
    expect(t('Activities.ExamActivity.points', { count: 3 })).toBe('3 балла')
    expect(t('Activities.ExamActivity.points', { count: 25 })).toBe('25 баллов')
    expect(t('Activities.ExamActivity.minutes', { count: 1 })).toBe('1 минута')
    // A literal `#` inside a plural branch is not the count.
    expect(t('FileSubmissionReview.attemptInfo', { attemptNumber: 2, count: 3 })).toBe('Попытка №2 · 3 файла')
  })

  it('renders en plurals, dates and rich-text markup', () => {
    const t = translator('en-US', enMessages)
    expect(t('Activities.ExamActivity.points', { count: 1 })).toBe('1 point')
    expect(t('FileSubmissionReview.attemptInfo', { attemptNumber: 2, count: 3 })).toBe('Attempt #2 · 3 files')
    expect(t('Components.CourseThumbnail.updatedDate', { updateDate: new Date('2026-03-05T12:00:00Z') })).toBe(
      'Updated Mar 5, 2026',
    )
    const rich = t.rich('DashPage.CourseManagement.Overview.access.privateNoGroupsWarning', {
      link: (chunks: unknown) => `[${String(chunks)}]`,
    })
    expect(String(rich)).toContain('[Access]')
  })

  it.each([
    ['ru-RU', ruMessages],
    ['kk-KZ', kkMessages],
    ['en-US', enMessages],
  ])('%s: every message parses', (locale, raw) => {
    const errors: string[] = []
    const t = translator(locale, raw, errors)
    const walk = (node: Record<string, unknown>, path: string[]) => {
      for (const [key, value] of Object.entries(node)) {
        if (key === '$schema') continue
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          walk(value as Record<string, unknown>, [...path, key])
          continue
        }
        // Formatting with no values fails on a missing argument, which is fine; parsing errors are not.
        t.rich([...path, key].join('.'))
      }
    }
    walk(raw as Record<string, unknown>, [])
    expect(errors.filter(message => !message.includes('FORMATTING_ERROR'))).toEqual([])
  })
})
