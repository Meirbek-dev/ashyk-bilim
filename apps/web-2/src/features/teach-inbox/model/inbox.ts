import type { CourseId, WorkItem, WorkQueue } from '#/shared/api/gen/types.gen'

import type { InboxSearch } from '../route'

export { INBOX_KINDS, type InboxKind, type InboxSearch, isInboxKind } from '../route'

// ponytail: /work has no kind/course filter, so the filters narrow the pages loaded so far; move them into the
// request when the server takes `kind` and `course_id`.
export const filterItems = (items: readonly WorkItem[], { kind, course }: InboxSearch): WorkItem[] =>
  items.filter(item => (!kind || item.kind === kind) && (!course || item.course_id === course))

/** The courses of the loaded rows, first appearance first: the options of the course filter. */
export const courseOptions = (items: readonly WorkItem[]): { id: CourseId; title: string }[] => [
  ...new Map(items.map(item => [item.course_id, { id: item.course_id, title: item.course_title }])).values(),
]

/** The row's one action, from `allowed_actions` only: grading wins over opening a saved grade. */
const ROW_ACTIONS = ['grade', 'review'] as const
export type RowAction = (typeof ROW_ACTIONS)[number]
export const rowAction = (item: Pick<WorkItem, 'allowed_actions'>): RowAction | undefined =>
  ROW_ACTIONS.find(action => item.allowed_actions.includes(action))

/**
 * The submission (or file attempt) behind a row: `WorkItem` has no id field, the server puts it in `href`, either
 * map of `AB__SERVER__WEB_LINKS`: `v2` `.../submissions/{id}`, `legacy` `...?submission={id}`.
 */
// ponytail: href parsing; read `item.submission_id` once the server's WorkItem carries it.
export const submissionIdOf = (item: Pick<WorkItem, 'href'>): string | undefined =>
  /(?:\/submissions\/|[?&]submission=)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?&#]|$)/i.exec(
    item.href,
  )?.[1]

/** Keyset paging: the next request carries the previous page's opaque `next_cursor`. */
export const nextWorkCursor = (page: WorkQueue): string | undefined => page.next_cursor ?? undefined
