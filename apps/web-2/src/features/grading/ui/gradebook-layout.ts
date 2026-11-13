import type { GradebookRow } from '../model/gradebook'

export const learnerName = (row: GradebookRow) => row.user.display_name || row.user.username

// The frozen part: the learner on a phone, the learner and the course total from @3xl (the widths fix the second offset).
export const LEARNER =
  'sticky left-0 w-32 min-w-32 border-r bg-background pr-3 text-left @3xl:w-60 @3xl:min-w-60 @3xl:border-r-0'
export const TOTAL =
  'w-28 min-w-28 px-3 text-right @3xl:sticky @3xl:left-60 @3xl:w-32 @3xl:min-w-32 @3xl:border-r @3xl:bg-background @3xl:pe-4'
export const ACTIVITY = 'w-32 min-w-32 px-3 text-right'
// What is left of the page's width after the columns: the rules run to the page's edge while the figures stay beside the
// names (two columns stretched over a wide page stood a hand apart). Empty, and not a cell to a screen reader.
export const REST = 'w-full p-0'
// The rows answer the pointer across the frozen cells too, whose opaque paper would otherwise stay put.
export const ROW_CELL = 'border-b py-2.5 align-baseline group-hover/row:bg-accent'
