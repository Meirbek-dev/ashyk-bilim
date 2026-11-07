/**
 * A grading field on one line: the label, then a narrow box with figures at its right edge, as on a marking sheet. Features
 * lay out a stock field from the outside: the label stays the input's accessible name, an error goes under both.
 */
export const SCORE_LINE =
  '[&_[data-slot=field]]:grid [&_[data-slot=field]]:grid-cols-[minmax(0,1fr)_5rem] [&_[data-slot=field]]:items-center [&_[data-slot=field]]:gap-x-3 [&_[data-slot=field-error]]:col-span-2 [&_input]:text-right [&_input]:tabular-nums'

/** The grade itself: the same line, its figure in the display face. */
export const GRADE_LINE = `${SCORE_LINE} [&_input]:font-heading [&_input]:text-lg`
