import { describe, expect, test } from 'vite-plus/test'

import type { GradingMetrics } from '#/shared/api/gen/types.gen'

import { acceptance, decided, feedbackChange, oneDecimal } from './metrics'

const metrics: GradingMetrics = {
  activities: [],
  applied_adjusted: 3,
  applied_exact: 6,
  days: 30,
  discarded: 1,
  drafts: 14,
  failed: 0,
  mean_abs_delta: 4.2,
  median_feedback_hours: 20,
  previous_median_feedback_hours: 50,
  ready: 4,
  saved_hours: 0.9,
}

describe('B-AIG-03 metrics of AI grading', () => {
  test('B-AIG-03 time to feedback: shorter than the period before is faster, longer slower', () => {
    expect(feedbackChange(20, 50)).toEqual({ before: 50, trend: 'faster' })
    expect(feedbackChange(50, 20)).toEqual({ before: 20, trend: 'slower' })
    expect(feedbackChange(20.04, 19.96)).toEqual({ before: 20, trend: 'same' })
  })

  test('B-AIG-03 no comparison without both periods', () => {
    expect(feedbackChange(null, 50)).toBeNull()
    expect(feedbackChange(20, null)).toBeNull()
  })

  test('B-AIG-03 acceptance is the share of decided drafts applied as proposed', () => {
    expect(decided(metrics)).toBe(10)
    expect(acceptance(metrics)).toBe(60)
    expect(acceptance({ ...metrics, applied_exact: 0, applied_adjusted: 0, discarded: 0 })).toBeNull()
  })

  test('B-AIG-03 hours and points at one decimal', () => {
    expect(oneDecimal(2.4999)).toBe(2.5)
    expect(oneDecimal(0.04)).toBe(0)
  })
})
