import type { GradedItem } from './types';

export function parseScoreInput(score: string, maxScore = 100): number | null {
  if (score === '') return null;
  const parsed = Number.parseFloat(score);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > maxScore) return null;
  return parsed;
}

export function formatPercentScore(score: number | null | undefined): string {
  return score === null || score === undefined ? '--' : `${Math.round(score * 100) / 100}%`;
}

export function formatScoreFraction(score: number | null | undefined, maxScore = 100): string {
  return score === null || score === undefined ? '--' : `${Math.round(score * 100) / 100}/${maxScore}`;
}

export function calculateItemPercent(items: GradedItem[] | undefined, itemScores: Record<string, number | null>) {
  if (!items?.length) return null;
  const totalMax = items.reduce((sum, item) => sum + item.max_score, 0);
  if (totalMax <= 0) return null;

  const totalScore = items.reduce((sum, item) => {
    const override = itemScores[item.item_id];
    const score = override ?? item.score ?? 0;
    return sum + score;
  }, 0);

  return Math.round((totalScore / totalMax) * 100 * 100) / 100;
}
