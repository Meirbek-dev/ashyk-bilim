import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { DataColumn } from '#/shared/components/data-columns'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/ui/button'
import { Checkbox } from '#/shared/ui/checkbox'

import type { QueueRow } from '../model/queue'
import type { QueueSearch } from '../model/search'
import { scoreText, statusMeta } from './labels'

type Ids = { courseId: string; activityId: string }
type Selection = { has: (id: string) => boolean; toggle: (id: string) => void }

const learnerName = (row: QueueRow) => row.user.display_name || row.user.username

function Learner({ row }: { row: QueueRow }) {
  const note =
    'staff' in row && row.staff ? m.grading_staff() : 'enrolled' in row && !row.enrolled ? m.grading_left() : null
  return (
    <span className="flex flex-col">
      <span className="wrap-anywhere">{learnerName(row)}</span>
      <span className="text-xs wrap-anywhere text-muted-foreground">@{row.user.username}</span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </span>
  )
}

const selectColumn = (selection: Selection): DataColumn<QueueRow> => ({
  id: 'select',
  header: m.grading_col_select(),
  priority: 2,
  cell: row => (
    <Checkbox
      aria-label={m.grading_select_row({ name: learnerName(row) })}
      checked={selection.has(row.id)}
      onCheckedChange={() => selection.toggle(row.id)}
    />
  ),
})

/** The queue's columns (B-GRD-01): the action leads into the review, keeping the queue's filters (B-GRD-10). */
export function queueColumns(ids: Ids, search: QueueSearch, selection: Selection | null): DataColumn<QueueRow>[] {
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
        <span className="flex flex-wrap items-center gap-2">
          {row.submitted_at_unix === null ? null : (
            <span className="tabular-nums">{formatDateTime(row.submitted_at_unix)}</span>
          )}
          {row.is_late ? <StatusBadge tone="warning">{m.grading_late()}</StatusBadge> : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: m.grading_col_status(),
      priority: 2,
      cell: row => <StatusBadge tone={statusMeta[row.status].tone}>{statusMeta[row.status].label()}</StatusBadge>,
    },
    {
      id: 'final_score',
      header: m.grading_col_score(),
      priority: 2,
      sortable: true,
      cell: row => <span className="tabular-nums">{scoreText(row.final_score)}</span>,
    },
    {
      id: 'action',
      header: m.grading_col_action(),
      priority: 2,
      cell: row => (
        <RouterLink
          className={buttonVariants({ variant: 'outline' })}
          to="/teach/courses/$courseId/activities/$activityId/submissions/$submissionId"
          params={{ ...ids, submissionId: row.id }}
          search={search}
        >
          {row.allowed_actions.length > 0 ? m.grading_action_grade() : m.grading_action_open()}
        </RouterLink>
      ),
    },
  ]
}
