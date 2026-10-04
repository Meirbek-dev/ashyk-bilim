import type { CourseId, WorkItem, WorkQueue } from '#/shared/api/gen/types.gen'

import type { InboxSearch } from '../route'

export { INBOX_KINDS, INBOX_SORTS, type InboxKind, type InboxSearch, type InboxSort, isInboxKind } from '../route'

/** The URL filters as `GET /work` takes them: the server filters and orders the whole queue (B-INB-04, B-INB-05). */
export const workQuery = ({ kind, course, sort }: InboxSearch) => ({
  ...(kind ? { kind } : {}),
  ...(course ? { course_id: course } : {}),
  ...(sort ? { sort } : {}),
})

/** The courses of the loaded rows, first appearance first: the options of the course filter. */
export const courseOptions = (items: readonly WorkItem[]): { id: CourseId; title: string }[] => [
  ...new Map(items.map(item => [item.course_id, { id: item.course_id, title: item.course_title }])).values(),
]

/** The row's one action, from `allowed_actions` only: grading wins over opening a saved grade. */
const ROW_ACTIONS = ['grade', 'review'] as const
export type RowAction = (typeof ROW_ACTIONS)[number]
export const rowAction = (item: Pick<WorkItem, 'allowed_actions'>): RowAction | undefined =>
  ROW_ACTIONS.find(action => item.allowed_actions.includes(action))

/** The work behind a row: the assessment submission or the file attempt; the review route takes either. */
export const submissionIdOf = (item: Pick<WorkItem, 'submission_id' | 'attempt_id'>): string | undefined =>
  item.submission_id ?? item.attempt_id

/** Keyset paging: the next request carries the previous page's opaque `next_cursor`. */
export const nextWorkCursor = (page: WorkQueue): string | undefined => page.next_cursor ?? undefined
