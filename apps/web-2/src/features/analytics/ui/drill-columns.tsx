import { m } from '#/paraglide/messages'
import type { DrillMetric } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate, formatNumber } from '#/shared/i18n/format'

import type { DrillRow } from '../model/analytics'
import { hours, percent, score } from './kpi'

const dash = '—'
type Column = DataColumn<DrillRow>

const learner = (): Column => ({
  id: 'learner',
  header: m.analytics_col_learner(),
  priority: 1,
  cell: row => <span className="wrap-anywhere">{row.user_display_name}</span>,
})

const course = (): Column => ({
  id: 'course',
  header: m.analytics_col_course(),
  priority: 2,
  cell: row => <span className="wrap-anywhere">{row.course_name ?? dash}</span>,
})

const submitted = (): Column => ({
  id: 'submitted',
  header: m.analytics_col_submitted(),
  priority: 3,
  cell: row => (row.submitted_at_unix ? formatDate(row.submitted_at_unix) : dash),
})

const backlog = (): Column[] => [
  learner(),
  { id: 'assessment', header: m.analytics_col_assessment(), priority: 2, cell: row => row.assessment_title ?? dash },
  course(),
  submitted(),
  {
    id: 'age',
    header: m.analytics_col_age(),
    priority: 2,
    cell: row => (
      <span className="inline-flex flex-wrap items-center gap-1">
        {hours(row.age_hours)}
        {row.sla_breached ? <StatusBadge tone="destructive">{m.analytics_sla_breached()}</StatusBadge> : null}
      </span>
    ),
  },
]

const passRate = (): Column[] => [
  learner(),
  { id: 'best', header: m.analytics_col_best_score(), priority: 2, cell: row => score(row.best_score) },
  { id: 'last', header: m.analytics_col_last_score(), priority: 3, cell: row => score(row.last_score) },
  { id: 'attempts', header: m.analytics_col_attempts(), priority: 3, cell: row => score(row.attempts) },
  submitted(),
  {
    id: 'result',
    header: m.analytics_col_result(),
    priority: 2,
    cell: row =>
      row.passed ? (
        <StatusBadge tone="success">{m.analytics_passed()}</StatusBadge>
      ) : (
        <StatusBadge tone="neutral">{m.analytics_failed()}</StatusBadge>
      ),
  },
]

const progress = (): Column[] => [
  learner(),
  course(),
  { id: 'progress', header: m.analytics_col_progress(), priority: 2, cell: row => percent(row.progress_pct) },
  {
    id: 'steps',
    header: m.analytics_col_steps(),
    priority: 3,
    cell: row =>
      row.total_steps === undefined ? (
        dash
      ) : (
        <span className="tabular-nums">
          {m.analytics_steps({ done: formatNumber(row.completed_steps ?? 0), total: formatNumber(row.total_steps) })}
        </span>
      ),
  },
  {
    id: 'activity',
    header: m.analytics_col_last_activity(),
    priority: 3,
    cell: row => (row.last_activity_at_unix ? formatDate(row.last_activity_at_unix) : dash),
  },
]

/** The columns of each drill-through: the fields its rows carry (see `drillRowSchema`). */
export function drillColumns(metric: DrillMetric): Column[] {
  if (metric === 'backlog') return backlog()
  if (metric === 'pass_rate') return passRate()
  return progress()
}
