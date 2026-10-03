import type { ActivityId, GradebookCell, GradebookData, GradebookPage, UserSummary } from '#/shared/api/gen/types.gen'

import type { GradebookSearch } from '../route'

/** Learners per page; each comes with all their cells. */
const GRADEBOOK_PAGE = 100

/** The URL filters as the server's: search, "has work to review" and the group (B-GRD-20, B-GRD-24). */
export const gradebookQuery = (search: GradebookSearch): NonNullable<GradebookData['query']> => ({
  limit: GRADEBOOK_PAGE,
  ...(search.q ? { q: search.q } : {}),
  ...(search.pending ? { status: 'needs_grading' } : {}),
  ...(search.group ? { group_id: search.group } : {}),
})

/** A graded activity as a column: an assessment or a file submission. */
export type GradebookColumn = { activityId: ActivityId; title: string }

/** The columns of every loaded page, first appearance first (each page repeats the course's columns). */
export function gradebookColumns(pages: readonly GradebookPage[]): GradebookColumn[] {
  const columns = new Map<ActivityId, GradebookColumn>()
  for (const page of pages)
    for (const column of [...page.assessments, ...page.file_submissions])
      if (!columns.has(column.activity_id))
        columns.set(column.activity_id, { activityId: column.activity_id, title: column.title })
  return [...columns.values()]
}

/** One learner's row: the cell of each activity they handed in. */
export type GradebookRow = { user: UserSummary; cells: Map<ActivityId, GradebookCell> }

export function gradebookRows(pages: readonly GradebookPage[]): GradebookRow[] {
  return pages.flatMap(page =>
    page.users.map(user => ({
      user,
      cells: new Map(page.cells.filter(cell => cell.user_id === user.id).map(cell => [cell.activity_id, cell])),
    })),
  )
}

/**
 * Where a cell leads (B-GRD-19): the attempt still awaiting grading if there is one (UX-123), else the grade of
 * record - a submission id or a file attempt id, whichever the cell is about.
 */
export const reviewTarget = (cell: GradebookCell): string | null =>
  cell.pending_attempt_id ?? cell.submission_id ?? cell.attempt_id
