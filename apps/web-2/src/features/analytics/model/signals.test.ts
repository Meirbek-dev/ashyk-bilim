import { describe, expect, test } from 'vite-plus/test'

import {
  vAnalyticsCode,
  vOutlierReasonCode,
  vRecommendedAction,
  vRiskReasonCode,
  vSeverity,
  vWhyNow,
} from '#/shared/api/gen/valibot.gen'
import { formatNumber } from '#/shared/i18n/format'

import {
  outlierLabels,
  recommendedActionLabels,
  riskReasonLabels,
  severityBadges,
  signalHref,
  signalText,
  whyNowLabels,
} from './signals'

/** How many different non-empty texts the values get: equal to the number of values when each has its own. */
const distinctTexts = (labels: Record<string, () => string>, values: readonly string[]): number =>
  new Set(values.map(value => labels[value]?.()).filter(Boolean)).size

describe('analytics signals', () => {
  test('B-ANL-23 every alert, insight, forecast and anomaly code reads as a sentence with its params', () => {
    for (const code of vAnalyticsCode.options) expect(signalText[code]({})).not.toBe('')
    expect(signalText.risk_spike({ count: 1200 })).toBe(`Учащихся в зоне риска: ${formatNumber(1200)}`)
    expect(signalText.completion_target_miss({ course_name: 'Алгебра', count: 3 })).toBe(
      '«Алгебра»: учащихся, которые вряд ли завершат курс в срок: 3',
    )
    expect(signalText.low_pass_rate({ assessment_title: 'Тест 1', pass_rate: 42.5 })).toContain('42,5')
    expect(
      signalText.grading_slo_watch({
        assessment_title: 'Эссе',
        course_name: 'C',
        oldest_hours: 50.5,
        target_hours: 72,
      }),
    ).toBe('«Эссе» (C): работа ждёт проверки 50,5 ч, срок - 72 ч')
  })

  test('B-ANL-23 a content bottleneck names its signal; an unknown signal is shown as sent', () => {
    expect(signalText.content_bottleneck({ activity_name: 'Видео', signal: 'exit_after_open' })).toBe(
      '«Видео»: уходят сразу после открытия',
    )
    expect(signalText.content_bottleneck({ activity_name: 'Видео', signal: 'new_signal' })).toBe('«Видео»: new_signal')
  })

  test('B-ANL-23 B-ANL-24 every severity, why-now, action, risk reason and outlier value has its own text', () => {
    const severity = Object.fromEntries(Object.entries(severityBadges).map(([key, badge]) => [key, badge.label]))
    expect(distinctTexts(severity, vSeverity.options)).toBe(vSeverity.options.length)
    expect(distinctTexts(whyNowLabels, vWhyNow.options)).toBe(vWhyNow.options.length)
    expect(distinctTexts(recommendedActionLabels, vRecommendedAction.options)).toBe(vRecommendedAction.options.length)
    expect(distinctTexts(riskReasonLabels, vRiskReasonCode.options)).toBe(vRiskReasonCode.options.length)
    expect(distinctTexts(outlierLabels, vOutlierReasonCode.options)).toBe(vOutlierReasonCode.options.length)
  })

  test('B-ANL-25 a signal links only into the analytics tabs of this web', () => {
    expect(signalHref('/teach/analytics/learners?course=c')).toBe('/teach/analytics/learners?course=c')
    expect(signalHref('/dash/analytics/learners/at-risk')).toBeUndefined()
    expect(signalHref(null)).toBeUndefined()
  })
})
