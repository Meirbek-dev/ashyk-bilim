import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import { getAnalyticsCodeLabel, getAnalyticsMessage, getAnalyticsStatusLabel } from '@/lib/analytics/labels'
import kk from '@/messages/kk-KZ.json'
import ru from '@/messages/ru-RU.json'

// Gauntlet F31/F32/F33: wire codes (`active_learners`, `pct_of_enrolled`,
// `too_hard`, `offer_targeted_help`, …) were rendered verbatim in ru/kk.
describe('getAnalyticsCodeLabel', () => {
  const catalog: Record<string, string> = {
    'codes.active_learners': 'Активные учащиеся',
    'codes.learner_contacted': 'С учащимся связались',
    'atRisk.na': 'н/д',
  }
  const t = Object.assign(
    (key: string, values?: Record<string, string | number>) =>
      Object.entries(values ?? {}).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), catalog[key] ?? key),
    { has: (key: string) => key in catalog },
  )

  it('resolves known codes through TeacherAnalytics.codes', () => {
    expect(getAnalyticsCodeLabel(t, 'active_learners')).toBe('Активные учащиеся')
  })

  it('maps outcomes the old client stored as English prose onto their codes', () => {
    expect(getAnalyticsCodeLabel(t, 'Learner contacted')).toBe('С учащимся связались')
  })

  it('humanises unknown codes instead of leaking the key path', () => {
    expect(getAnalyticsCodeLabel(t, 'some_new_code')).toBe('some new code')
    expect(getAnalyticsCodeLabel(t, null)).toBe('н/д')
  })
})

type LooseTranslator = ((key: string, values?: Record<string, string | number>) => string) & { has: (key: string) => boolean }

describe('getAnalyticsMessage', () => {
  const catalog: Record<string, string> = {
    'messages.grading_backlog.title': 'Очередь проверки требует внимания',
    'messages.grading_backlog.body': 'Ожидают проверки: {count}',
    'messages.grading_slo_breached.title': '{assessment_title}: превышен срок проверки',
    'messages.grading_slo_breached.body': '{breaches} в курсе «{course_name}», самая старая {oldest_hours} ч',
    'messages.missing_event_sources.title': 'Нет данных',
    'messages.missing_event_sources.body': 'Нет данных: {sources}',
    'codes.exam_attempts': 'попытки экзаменов',
    'codes.event_log': 'журнал событий',
  }
  const t = Object.assign(
    (key: string, values?: Record<string, string | number>) =>
      Object.entries(values ?? {}).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), catalog[key] ?? key),
    { has: (key: string) => key in catalog },
  )

  it('renders code + params through the messages catalog', () => {
    expect(getAnalyticsMessage(t, { code: 'grading_backlog', params: { count: 12 } })).toEqual({
      title: 'Очередь проверки требует внимания',
      body: 'Ожидают проверки: 12',
    })
  })

  it('keeps the grading SLO course name and oldest age (they were lost with the prose)', () => {
    expect(
      getAnalyticsMessage(t, {
        code: 'grading_slo_breached',
        params: { assessment_title: 'Final Exam', course_name: 'Python', breaches: 3, awaiting: 5, oldest_hours: 80.5, target_hours: 72 },
      }),
    ).toEqual({ title: 'Final Exam: превышен срок проверки', body: '3 в курсе «Python», самая старая 80.5 ч' })
  })

  // UX-148: numeric params reached ICU bare («66.7%» in ru); the catalogs format them as `{x, number}`.
  it.each([
    ['ru-RU', ru, '66,7%'],
    ['kk-KZ', kk, '66,7%'],
  ])('%s formats numeric params with the locale', (locale, messages, expected) => {
    const t = createTranslator({ locale, messages, namespace: 'TeacherAnalytics' }) as unknown as LooseTranslator
    const { body } = getAnalyticsMessage(t, { code: 'assessment_failure_risk', params: { assessment_title: 'Exam', expected_pct: 66.7 } })
    expect(body).toContain(expected)
    expect(body).not.toContain('66.7')
  })

  it('renders list params through codes.* before joining', () => {
    expect(
      getAnalyticsMessage(t, { code: 'missing_event_sources', params: { sources: ['exam_attempts', 'event_log'] } }).body,
    ).toBe('Нет данных: попытки экзаменов, журнал событий')
  })
})

// Gauntlet F32: the assessment learner table showed the raw submission status
// (`published`) — v2 statuses are draft/pending/graded/published/returned.
describe('getAnalyticsStatusLabel', () => {
  const t = (key: string) => key

  it('maps every v2 submission status onto a catalog key', () => {
    for (const status of ['draft', 'pending', 'graded', 'published', 'returned']) {
      expect(getAnalyticsStatusLabel(t, status)).toBe(`labels.status.${status}`)
    }
  })
})
