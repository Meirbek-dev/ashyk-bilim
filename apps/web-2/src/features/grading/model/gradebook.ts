import type {
  ActivityId,
  Curriculum,
  GradebookCell,
  GradebookData,
  GradebookPage,
  GradebookSummary,
  GradebookTotal,
  UserSummary,
} from '#/shared/api/gen/types.gen'

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

/**
 * The columns of every loaded page, once each, in the course program's order (the server lists tests, then hand-ins);
 * an activity the program no longer lists keeps its place after the rest.
 */
export function gradebookColumns(pages: readonly GradebookPage[], curriculum?: Curriculum): GradebookColumn[] {
  const columns = new Map<ActivityId, GradebookColumn>()
  for (const page of pages)
    for (const column of [...page.assessments, ...page.file_submissions])
      if (!columns.has(column.activity_id))
        columns.set(column.activity_id, { activityId: column.activity_id, title: column.title })
  const order = new Map(
    (curriculum?.chapters ?? []).flatMap(chapter => chapter.activities).map((activity, index) => [activity.id, index]),
  )
  const place = (column: GradebookColumn) => order.get(column.activityId) ?? order.size
  return [...columns.values()].toSorted((a, b) => place(a) - place(b))
}

/** One learner's row: the cell of each activity they handed in and their course total (B-GRD-37). */
export type GradebookRow = {
  user: UserSummary
  cells: Map<ActivityId, GradebookCell>
  total: GradebookTotal | undefined
}

export function gradebookRows(pages: readonly GradebookPage[]): GradebookRow[] {
  return pages.flatMap(page =>
    page.users.map(user => ({
      user,
      cells: new Map(page.cells.filter(cell => cell.user_id === user.id).map(cell => [cell.activity_id, cell])),
      total: page.totals.find(total => total.user_id === user.id),
    })),
  )
}

/** The average row (B-GRD-37): the server sends it with the first page, over every learner the filters match. */
export const gradebookSummary = (pages: readonly GradebookPage[]): GradebookSummary | null => pages[0]?.summary ?? null

/**
 * Where a cell leads (B-GRD-19): the attempt still awaiting grading if there is one (UX-123), else the grade of
 * record - a submission id or a file attempt id, whichever the cell is about.
 */
export const reviewTarget = (cell: GradebookCell): string | null =>
  cell.pending_attempt_id ?? cell.submission_id ?? cell.attempt_id

/**
 * What a cell adds under its grade when a newer attempt than the one shown waits for the teacher: a grade, or the
 * release of one. Nothing when the shown attempt is the waiting one (a single held attempt said «Новая попытка ждёт
 * проверки»).
 */
export const waitingNote = (cell: GradebookCell): 'grade' | 'release' | null =>
  cell.pending_attempt === null || cell.pending_attempt === cell.attempt_number
    ? null
    : cell.pending_attempt_status === 'graded'
      ? 'release'
      : 'grade'
