// Scores the grader types and reads (ported with their tests from the old web's grading domain, B-GRD-22).

/** Hundredths: the grading precision on both sides of the API. */
export const roundScore = (value: number): number => Math.round(value * 100) / 100

/** A typed score (comma or dot) within 0..=max; null for blank, garbage or out of range. */
export function parseScoreInput(value: string, max = 100): number | null {
  const text = value.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const parsed = Number(text)
  return parsed > max ? null : parsed
}

/** A non-blank score that is not a number within 0..=max: shown as a field error. */
export const isScoreInputInvalid = (value: string, max = 100): boolean =>
  value.trim() !== '' && parseScoreInput(value, max) === null

/**
 * Sum the raw scores, then round once to hundredths so float drift (`0.1 + 0.2`) never shows. Rounding each item
 * first inflates many small items (150 x 0.6667 summed as 150 x 0.67 = 100.5); rounding the total to one decimal is
 * how 99.99 became 100.0.
 */
export const sumScores = (values: readonly number[]): number =>
  roundScore(values.reduce((sum, value) => sum + value, 0))

/** A seeded score input at the grading precision; a blank or non-number stays as is. */
export function roundScoreInput(value: string): string {
  const n = Number(value)
  return value.trim() === '' || !Number.isFinite(n) ? value : String(roundScore(n))
}

/**
 * The breakdown keeps item points as a share of 100 while a grade save takes them on the item's own `max_score`
 * scale (a 3-question exam: share 33.33, item max 1). Unknown scale: as given.
 */
export const toItemScale = (score: number, breakdownMax: number, itemMax: number | undefined): number =>
  itemMax !== undefined && itemMax > 0 && breakdownMax > 0 ? (score / breakdownMax) * itemMax : score

/** The percent the item scores add up to (each `{ score, max }` on the same scale); null without points. */
export function itemsPercent(items: readonly { score: number; max: number }[]): number | null {
  const max = sumScores(items.map(item => item.max))
  if (max <= 0) return null
  return roundScore((sumScores(items.map(item => item.score)) / max) * 100)
}

/**
 * The item total of typed scores (a blank one counts 0); null until one is typed: «0 %» over an ungraded work read as
 * a grade. Null too while one is out of range («7» of 6): counted as 0 it gave a wrong total to apply as the grade.
 */
export function typedItemsPercent(rows: readonly { score: string; max: number }[]): number | null {
  if (rows.some(row => isScoreInputInvalid(row.score, row.max))) return null
  const scores = rows.map(row => parseScoreInput(row.score, row.max))
  if (scores.every(score => score === null)) return null
  return itemsPercent(rows.map((row, index) => ({ score: scores[index] ?? 0, max: row.max })))
}

/** The score after a late penalty, as the server applies it (`apply_late`, B-GRD-32): hundredths, penalty 0..100. */
export const afterLatePenalty = (score: number, penaltyPct: number): number =>
  roundScore(score * (1 - Math.min(Math.max(penaltyPct, 0), 100) / 100))

/**
 * The review header's last check (B-GRD-35): a check older than the hand-in was a return for revision, and the work on
 * screen is the learner's answer to it, so it reads «Возвращена», not «Проверена».
 */
export function lastCheck(head: { graded_at_unix: number | null; submitted_at_unix: number | null; status: string }) {
  if (head.graded_at_unix === null) return null
  const returned = head.submitted_at_unix !== null && head.graded_at_unix < head.submitted_at_unix
  // A saved draft stamps the check time too, while the work still waits: «grade draft saved», not «Проверена».
  const draft = !returned && (head.status === 'pending' || head.status === 'submitted')
  return { at: head.graded_at_unix, returned, draft }
}
