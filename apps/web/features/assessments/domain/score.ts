/**
 * Canonical score helpers.
 *
 * All assessment types normalize to a 0–100 percentage scale in the unified
 * grading model. These functions handle parsing, formatting, and normalization
 * for any assessment kind.
 */

export type ScoreSource = 'auto' | 'teacher' | 'none';

export interface NormalizedScore {
  /** 0–100 percentage, or null if not yet graded. */
  percent: number | null;
  /** Which score was used (teacher override > auto > none). */
  source: ScoreSource;
}

/**
 * Returns the canonical percentage score for display.
 * Teacher `final_score` takes precedence; falls back to `auto_score`.
 */
export function resolveScore(
  finalScore: number | null | undefined,
  autoScore: number | null | undefined,
): NormalizedScore {
  if (finalScore !== null && finalScore !== undefined) {
    return { percent: Math.round(finalScore * 100) / 100, source: 'teacher' };
  }
  if (autoScore !== null && autoScore !== undefined) {
    return { percent: Math.round(autoScore * 100) / 100, source: 'auto' };
  }
  return { percent: null, source: 'none' };
}

/** Format a 0–100 percent as a display string, e.g. "87.5%" or "--". */
export function formatPercent(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? '--' : `${Math.round(percent * 100) / 100}%`;
}

/**
 * Normalize a raw point score against a total to a 0–100 percentage.
 * Returns null when total is zero or inputs are invalid.
 */
export function normalizeToPercent(raw: number, total: number): number | null {
  if (!total || total <= 0) return null;
  const pct = (raw / total) * 100;
  return Math.round(pct * 100) / 100;
}

/** Parse a user-typed score string. Returns null on invalid input. */
export function parseScoreInput(value: string, maxScore = 100): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > maxScore) return null;
  return parsed;
}

/** Returns whether a score meets a given passing threshold (default 60%). */
export function isPassing(percent: number | null | undefined, passingThreshold = 60): boolean {
  return percent !== null && percent !== undefined && percent >= passingThreshold;
}
