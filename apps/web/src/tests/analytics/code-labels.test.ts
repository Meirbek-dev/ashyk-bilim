import { describe, expect, it } from 'vitest'
import { getAnalyticsAlertCopy, getAnalyticsCodeLabel } from '@/lib/analytics/labels'

// Gauntlet F31/F32/F33: wire codes (`active_learners`, `pct_of_enrolled`,
// `too_hard`, `offer_targeted_help`, …) were rendered verbatim in ru/kk.
describe('getAnalyticsCodeLabel', () => {
  const catalog: Record<string, string> = {
    'codes.active_learners': 'Активные учащиеся',
    'codes.learner_contacted': 'С учащимся связались',
    'atRisk.na': 'н/д',
    'codes.grading_queue_needs_attention': 'Очередь проверки требует внимания',
    'alertBody.grading_backlog': 'Ожидают проверки: {value}',
    'alertBody.grading_slo': 'В очереди: {value}',
    'alertTitle.grading_slo_breached': '{name}: превышен срок проверки',
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

describe('getAnalyticsAlertCopy', () => {
  const catalog: Record<string, string> = {
    'codes.grading_queue_needs_attention': 'Очередь проверки требует внимания',
    'alertBody.grading_backlog': 'Ожидают проверки: {value}',
    'alertBody.grading_slo': 'В очереди: {value}',
    'alertTitle.grading_slo_breached': '{name}: превышен срок проверки',
  }
  const t = Object.assign(
    (key: string, values?: Record<string, string | number>) =>
      Object.entries(values ?? {}).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), catalog[key] ?? key),
    { has: (key: string) => key in catalog },
  )

  it('rebuilds code titles and numeric bodies from the catalog', () => {
    expect(
      getAnalyticsAlertCopy(t, {
        kind: 'grading_backlog',
        title: 'grading_queue_needs_attention',
        body: '12 submissions are still awaiting review.',
      }),
    ).toEqual({ title: 'Очередь проверки требует внимания', body: 'Ожидают проверки: 12' })
  })

  it('keeps the assessment name out of the SLO title template and uses the queue count', () => {
    expect(
      getAnalyticsAlertCopy(t, {
        kind: 'grading_slo',
        title: 'Final Exam is outside the grading target',
        body: '3 submissions in Course exceeded the 72-hour grading target; 5 remain queued.',
        learner_count: 5,
      }),
    ).toEqual({ title: 'Final Exam: превышен срок проверки', body: 'В очереди: 5' })
  })
})
