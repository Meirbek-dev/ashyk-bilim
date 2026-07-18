import type { GradedItem } from './types'

export { formatPercent as formatPercentScore, parseScoreInput } from '@/features/assessments/domain/score'

export function formatScoreFraction(score: number | null | undefined, maxScore = 100): string {
  return score === null || score === undefined ? '--' : `${Math.round(score * 100) / 100}/${maxScore}`
}

export function calculateItemPercent(items: GradedItem[] | undefined, itemScores: Record<string, number | null>) {
  if (!items?.length) return null
  const totalMax = items.reduce((sum, item) => sum + (item.max_score ?? 0), 0)
  if (totalMax <= 0) return null

  const totalScore = items.reduce((sum, item) => {
    const override = itemScores[item.item_id]
    const score = override ?? item.score ?? 0
    return sum + score
  }, 0)

  return Math.round((totalScore / totalMax) * 100 * 100) / 100
}
