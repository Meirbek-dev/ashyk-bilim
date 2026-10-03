import { m } from '#/paraglide/messages'
import type { DrillMetric } from '#/shared/api/gen/types.gen'
import { formatDate, formatNumber } from '#/shared/i18n/format'
import { Badge } from '#/shared/ui/badge'
import type { DataColumn } from '#/shared/ui/data-columns'

import type { DrillRow } from '../model/analytics'
import { hours, percent } from './kpi'

const dash = '—'

/** The columns of each drill-through: the fields its rows carry (see `drillRowSchema`). */
export function drillColumns(metric: DrillMetric): DataColumn<DrillRow>[] {
  const learner: DataColumn<DrillRow> = {
    id: 'learner',
    header: m.analytics_col_learner(),
    priority: 1,
    cell: row => <span className="wrap-anywhere">{row.user_display_name}</span>,
  }
  const course: DataColumn<DrillRow> = {
    id: 'course',
    header: m.analytics_col_course(),
    priority: 2,
    cell: row => <span className="wrap-anywhere">{row.course_name ?? dash}</span>,
  }
  if (metric === 'backlog')
    return [
      learner,
      {
        id: 'assessment',
        header: m.analytics_col_assessment(),
        priority: 2,
        cell: row => row.assessment_title ?? dash,
      },
      course,
      { id: 'age', header: m.analytics_col_age(), priority: 2, cell: row => hours(row.age_hours) },
    ]
  if (metric === 'pass_rate')
    return [
      learner,
      {
        id: 'best',
        header: m.analytics_col_best_score(),
        priority: 2,
        cell: row => (row.best_score === null || row.best_score === undefined ? dash : formatNumber(row.best_score)),
      },
      {
        id: 'result',
        header: m.analytics_col_result(),
        priority: 2,
        cell: row =>
          row.passed ? (
            <Badge tone="success">{m.analytics_passed()}</Badge>
          ) : (
            <Badge tone="neutral">{m.analytics_failed()}</Badge>
          ),
      },
    ]
  return [
    learner,
    course,
    { id: 'progress', header: m.analytics_col_progress(), priority: 2, cell: row => percent(row.progress_pct) },
    {
      id: 'activity',
      header: m.analytics_col_last_activity(),
      priority: 3,
      cell: row => (row.last_activity_at_unix ? formatDate(row.last_activity_at_unix) : dash),
    },
  ]
}
