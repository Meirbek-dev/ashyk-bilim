import type { GradingMetrics } from '#/shared/api/gen/types.gen'

// The «ИИ-проверка» tab's numbers (docs/AI-FIRST.md 4.5), from `gradingMetrics` as sent.

/** Hours and percentage points at one decimal: «2,5 ч», never «2,4999». */
export const oneDecimal = (hours: number): number => Math.round(hours * 10) / 10

/**
 * Median time to feedback against the period before (B-AIG-03): shorter is better. Null without both numbers (a new
 * course, a quiet period): there is nothing to compare.
 */
export function feedbackChange(
  now: number | null,
  before: number | null,
): { before: number; trend: 'faster' | 'slower' | 'same' } | null {
  if (now === null || before === null) return null
  const [a, b] = [oneDecimal(now), oneDecimal(before)]
  return { before: b, trend: a < b ? 'faster' : a > b ? 'slower' : 'same' }
}

/** Drafts the teachers decided on: applied as is, applied with changes, discarded. */
export const decided = (metrics: GradingMetrics): number =>
  metrics.applied_exact + metrics.applied_adjusted + metrics.discarded

/** The share of decided drafts applied as proposed, 0..100 (B-AIG-03); null before any decision. */
export function acceptance(metrics: GradingMetrics): number | null {
  const total = decided(metrics)
  return total === 0 ? null : (metrics.applied_exact / total) * 100
}
