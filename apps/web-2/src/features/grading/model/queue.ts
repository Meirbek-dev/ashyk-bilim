import type {
  ActivityType,
  AssessmentReviewQueueData,
  FileReviewItem,
  FileSubmissionReviewQueueData,
  ReviewItem,
  Stats,
} from '#/shared/api/gen/types.gen'

import { type QueueSearch, type QueueStatus, SORTS } from '../route'

/** What is graded behind an activity: assessment submissions, file attempts, or nothing (a page, a video...). */
export type WorkKind = 'assessment' | 'file'
const KINDS = {
  quiz: 'assessment',
  exam: 'assessment',
  code_challenge: 'assessment',
  file_submission: 'file',
  dynamic: null,
  video: null,
  document: null,
  custom: null,
} satisfies Record<ActivityType, WorkKind | null>
export const workKind = (type: ActivityType): WorkKind | null => KINDS[type]

const PAGE_SIZE = 50

export const assessmentQuery = (search: QueueSearch): NonNullable<AssessmentReviewQueueData['query']> => ({
  limit: PAGE_SIZE,
  ...(search.status ? { status: search.status } : {}),
  ...(search.q ? { search: search.q } : {}),
  ...(search.late ? { late_only: true } : {}),
  ...(search.sort ? { sort: search.sort, order: search.order ?? 'desc' } : {}),
})

// ponytail: the file queue has no late filter and no sort (SPEC: waits for the server); they are dropped here.
export const fileQuery = (search: QueueSearch): NonNullable<FileSubmissionReviewQueueData['query']> => ({
  limit: PAGE_SIZE,
  ...(search.status ? { status: search.status === 'needs_grading' ? 'submitted' : search.status } : {}),
  ...(search.q ? { search: search.q } : {}),
})

/** The filters that narrow the queue (sort does not): "nothing found" vs "nothing yet". */
export const activeFilters = (search: QueueSearch): number =>
  [search.status, search.q, search.late].filter(Boolean).length

/** DataTable's sort <-> the URL: the server's default (newest first) is no sort at all. */
export const tableSort = (search: QueueSearch) =>
  search.sort ? { id: search.sort, desc: (search.order ?? 'desc') === 'desc' } : undefined
export function sortSearch(sort: { id: string; desc: boolean } | undefined): Pick<QueueSearch, 'sort' | 'order'> {
  const id = SORTS.find(known => known === sort?.id)
  return id && sort ? { sort: id, order: sort.desc ? 'desc' : 'asc' } : { sort: undefined, order: undefined }
}

/** One row of either queue. */
export type QueueRow = ReviewItem | FileReviewItem
export type QueuePage = { items: QueueRow[]; next_cursor: string | null }

/** Keyset paging: the next request carries the previous page's opaque `next_cursor`. */
export const nextQueueCursor = (page: QueuePage): string | undefined => page.next_cursor ?? undefined

/** The counts on the status links, from the server's stats (assessments only). */
export const statusCounts = (stats: Stats): Record<QueueStatus, number> => ({
  needs_grading: stats.needs_grading,
  graded: stats.graded,
  published: stats.published,
  returned: stats.returned,
})

/** Previous and next submission of the loaded queue around `id` (B-GRD-10). */
export function neighbours(ids: readonly string[], id: string): { prev?: string; next?: string } {
  const at = ids.indexOf(id)
  if (at < 0) return {}
  const prev = ids[at - 1]
  const next = ids[at + 1]
  return { ...(prev ? { prev } : {}), ...(next ? { next } : {}) }
}

/** Rows the server lets the caller return (B-GRD-08). */
export const returnable = (rows: readonly QueueRow[]): QueueRow[] =>
  rows.filter(row => row.allowed_actions.includes('return'))

/**
 * Deadline extension targets (B-GRD-09): course members only; a leaver or a staff member is named instead (UX-167,
 * UX-199). A file row has neither flag: no extension exists for file submissions.
 */
export function extensionTargets(rows: readonly QueueRow[]): { ids: string[]; skipped: string[] } {
  const ok = rows.filter(row => 'enrolled' in row && row.enrolled && !row.staff)
  const ids = [...new Set(ok.map(row => row.user.id))]
  const skipped = rows.filter(row => !ok.includes(row)).map(row => row.user.display_name || row.user.username)
  return { ids, skipped }
}
