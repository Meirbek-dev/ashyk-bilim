import { m } from '#/paraglide/messages'

import { scoreText } from './labels'

const SPLIT = /^(.*?\d)([.,]\d+)?(\D*)$/u
const SLOTS = {
  always: 'inline-block w-[4.75ch] text-left whitespace-pre',
  wide: '@2xl:inline-block @2xl:w-[4.75ch] @2xl:text-left @2xl:whitespace-pre',
}

type ScoreFigureProps = {
  score: number | null
  /** What the dash means, for screen readers. */
  missing?: string
  /** `wide`: a table that turns into cards when narrow; on a card the figure reads as plain text, without the slot. */
  column?: keyof typeof SLOTS
  /** A column with no fractions in it has nothing to line up: no slot, the unit stays beside the number. */
  slot?: boolean
}

/** Whether any of a column's scores has a fraction, so its figures need the slot. */
export const hasFraction = (scores: readonly (number | null | undefined)[]) =>
  scores.some(score => score !== null && score !== undefined && /[.,]\d/u.test(scoreText(score)))

/**
 * A score set for a column: what follows the whole number sits in a slot of one width, so «100 %» and «66,67 %» line up on
 * the decimal point as figures do in a printed table, the unit beside its number. The text a reader or a test gets is still «66,67 %». No score: a quiet dash
 * read as `missing`.
 */
export function ScoreFigure({
  score,
  missing = m.grading_no_score(),
  column = 'always',
  slot = true,
}: ScoreFigureProps) {
  if (score === null)
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">{missing}</span>
      </span>
    )
  const text = scoreText(score)
  const [, whole = text, fraction = '', unit = ''] = SPLIT.exec(text) ?? []
  return (
    <span className="whitespace-nowrap tabular-nums">
      {whole}
      <span className={slot ? SLOTS[column] : undefined}>
        {fraction}
        <span className="text-muted-foreground">{unit}</span>
      </span>
    </span>
  )
}
