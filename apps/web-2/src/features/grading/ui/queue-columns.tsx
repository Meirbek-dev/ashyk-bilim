import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { GradeDraftView } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/components/button-variants'
import { Checkbox } from '#/shared/ui/checkbox'

import type { QueueRow } from '../model/queue'
import type { QueueSearch } from '../route'
import { AiCell } from './ai-cell'
import { statusMeta } from './labels'
import { ScoreFigure } from './score-figure'
import { StatusText } from './status-text'

type Ids = { courseId: string; activityId: string }
type Selection = {
  has: (id: string) => boolean
  toggle: (id: string) => void
  /** Every loaded row is selected: the header checkbox then clears the choice, else selects them all. */
  all: boolean
  toggleAll: () => void
}

const learnerName = (row: QueueRow) => row.user.display_name || row.user.username

function Learner({ row }: { row: QueueRow }) {
  const note =
    'staff' in row && row.staff ? m.grading_staff() : 'enrolled' in row && !row.enrolled ? m.grading_left() : null
  return (
    <span className="flex flex-col">
      <span className="font-medium wrap-anywhere">{learnerName(row)}</span>
      <span className="font-sans text-xs font-normal wrap-anywhere text-muted-foreground">@{row.user.username}</span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </span>
  )
}

const selectColumn = (selection: Selection): DataColumn<QueueRow> => ({
  id: 'select',
  header: m.grading_col_select(),
  headerCell: (
    <Checkbox aria-label={m.grading_select_all()} checked={selection.all} onCheckedChange={selection.toggleAll} />
  ),
  priority: 2,
  select: true,
  cell: row => (
    <Checkbox
      aria-label={m.grading_select_row({ name: learnerName(row) })}
      checked={selection.has(row.id)}
      onCheckedChange={() => selection.toggle(row.id)}
    />
  ),
})

/** The action leads into the review of the row's work, keeping the queue's filters (B-GRD-10). */
const actionColumn = (ids: Ids, search: QueueSearch): DataColumn<QueueRow> => ({
  id: 'action',
  header: m.grading_col_action(),
  headerCell: <span className="sr-only">{m.grading_col_action()}</span>,
  priority: 2,
  action: true,
  stretch: true,
  cell: row => {
    // Graded or not, a work still to release is graded (what is left to do stands out); a released or returned one is
    // opened, and quietly.
    const toGrade = row.allowed_actions.length > 0 && !['published', 'returned'].includes(row.status)
    return (
      <RouterLink
        className={
          toGrade
            ? buttonVariants({ variant: 'outline', size: 'sm' })
            : `-mx-3 ${buttonVariants({ variant: 'ghost', size: 'sm' })}`
        }
        to="/teach/courses/$courseId/activities/$activityId/submissions/$submissionId"
        params={{ ...ids, submissionId: row.id }}
        search={search}
      >
        {toGrade ? m.grading_action_grade() : m.grading_action_open()}
      </RouterLink>
    )
  },
})

/**
 * The queue's columns (B-GRD-01): the action leads into the review, keeping the queue's filters (B-GRD-10). With AI
 * drafts on the activity, an «ИИ» column beside the grade (B-GRD-40).
 */
export function queueColumns(
  ids: Ids,
  search: QueueSearch,
  selection: Selection | null,
  drafts: ReadonlyMap<string, GradeDraftView> | null = null,
): DataColumn<QueueRow>[] {
  return [
    ...(selection ? [selectColumn(selection)] : []),
    { id: 'learner', header: m.grading_col_learner(), priority: 1, cell: row => <Learner row={row} /> },
    {
      id: 'attempt_number',
      header: m.grading_col_attempt(),
      priority: 3,
      sortable: true,
      cell: row => <span className="tabular-nums">{formatNumber(row.attempt_number)}</span>,
    },
    {
      id: 'submitted_at',
      header: m.grading_col_submitted(),
      priority: 2,
      sortable: true,
      cell: row => (
        <span className="flex flex-col">
          {row.submitted_at_unix === null ? null : (
            <span className="tabular-nums">{formatDateTime(row.submitted_at_unix)}</span>
          )}
          {row.is_late ? (
            <span className="text-xs">
              <StatusText tone="warning">{m.grading_late()}</StatusText>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: m.grading_col_status(),
      priority: 2,
      cell: row => <StatusText tone={statusMeta[row.status].tone}>{statusMeta[row.status].label()}</StatusText>,
    },
    ...(drafts && drafts.size > 0
      ? [
          {
            id: 'ai',
            header: m.grading_col_ai(),
            priority: 2,
            cell: (row: QueueRow) => <AiCell draft={drafts.get(row.id)} />,
          } satisfies DataColumn<QueueRow>,
        ]
      : []),
    {
      id: 'final_score',
      header: m.grading_col_score(),
      priority: 2,
      sortable: true,
      cell: row => <ScoreFigure score={row.final_score} column="wide" />,
    },
    actionColumn(ids, search),
  ]
}
