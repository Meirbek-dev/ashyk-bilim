import type { GradebookRow } from '../model/gradebook'

export const learnerName = (row: GradebookRow) => row.user.display_name || row.user.username

// The frozen part: the learner on a phone, the learner and the course total from @3xl (the widths fix the second offset).
export const LEARNER =
  'sticky left-0 w-32 min-w-32 border-r bg-background pr-3 text-left @3xl:w-56 @3xl:min-w-56 @3xl:border-r-0'
export const TOTAL =
  'w-28 min-w-28 px-3 text-right last:pe-0 @3xl:sticky @3xl:left-56 @3xl:w-40 @3xl:min-w-40 @3xl:border-r @3xl:bg-background @3xl:last:border-r-0'
export const ACTIVITY = 'w-32 min-w-32 px-3 text-right'
// The rows answer the pointer across the frozen cells too, whose opaque paper would otherwise stay put.
export const ROW_CELL = 'border-b py-2.5 align-baseline group-hover/row:bg-accent'
