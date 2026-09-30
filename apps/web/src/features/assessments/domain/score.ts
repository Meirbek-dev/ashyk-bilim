/**
 * Canonical score helpers.
 *
 * All assessment types normalize to a 0–100 percentage scale in the unified
 * grading model. These functions handle parsing, formatting, and normalization
 * for any assessment kind.
 */

export type ScoreSource = 'auto' | 'teacher' | 'final' | 'none'

export interface NormalizedScore {
  /** 0–100 percentage, or null if not yet graded. */
  percent: number | null
  /** Which score was used (teacher override > auto > none). */
  source: ScoreSource
}

/** Format a 0–100 percent as a display string, e.g. "87.5%" or "--". */
export function formatPercent(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? '--' : `${Math.round(percent * 100) / 100}%`
}

/** Parse a user-typed score string. Returns null on invalid input. */
export function parseScoreInput(value: string, maxScore = 100): number | null {
  if (!value.trim()) return null
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed) || parsed < 0 || parsed > maxScore) return null
  return parsed
}
