import type { GradedItem } from './types'

import { parseScoreInput } from '@/features/assessments/domain/score'

export { formatPercent as formatPercentScore, parseScoreInput } from '@/features/assessments/domain/score'

/** A non-empty score the grader typed that is not a number within 0..=max — shown as a field error. */
export function isScoreInputInvalid(value: string, maxScore = 100): boolean {
  return value.trim() !== '' && parseScoreInput(value, maxScore) === null
}

/**
 * The grade save takes item scores on the item's own `max_score` scale, while
 * the breakdown the grader edits keeps them as a share of 100 — convert on the
 * way out (the server converts back). Unknown scale → send as typed.
 */
export function toItemScale(score: number, breakdownMax: number, itemMax: number | undefined): number {
  return itemMax !== undefined && itemMax > 0 && breakdownMax > 0 ? (score / breakdownMax) * itemMax : score
}

/**
 * Sum the raw scores, then round once to hundredths (the display precision) so
 * binary-float drift (`0.1 + 0.2`) never shows. Rounding each item first
 * inflates many small items: 150 × 0.6667 summed as 150 × 0.67 = 100.5.
 * Display the result as-is — rounding it to one decimal is how `99.99` became `100.0`.
 */
export function sumScores(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100
}

export function formatScoreFraction(score: number | null | undefined, maxScore = 100): string {
  return score === null || score === undefined ? '--' : `${Math.round(score * 100) / 100}/${maxScore}`
}

export function calculateItemPercent(items: GradedItem[] | undefined, itemScores: Record<string, number | null>) {
  if (!items?.length) return null
  const totalMax = sumScores(items.map(item => item.max_score ?? 0))
  if (totalMax <= 0) return null

  const totalScore = sumScores(items.map(item => itemScores[item.item_id] ?? item.score ?? 0))

  return Math.round((totalScore / totalMax) * 100 * 100) / 100
}
