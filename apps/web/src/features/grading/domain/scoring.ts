import type { GradedItem } from './types'

import { parseScoreInput } from '@/features/assessments/domain/score'

export { formatPercent as formatPercentScore, parseScoreInput } from '@/features/assessments/domain/score'

/** A non-empty score the grader typed that is not a number within 0..=max — shown as a field error. */
export function isScoreInputInvalid(value: string, maxScore = 100): boolean {
  return value.trim() !== '' && parseScoreInput(value, maxScore) === null
}

/**
 * Sum scores on integer hundredths (the grading precision) so binary-float
 * drift (`0.1 + 0.2`) never pushes an item total past its maximum; display the
 * result as-is — rounding it to one decimal is how `99.99` became `100.0`.
 */
export function sumScores(values: number[]): number {
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100
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
