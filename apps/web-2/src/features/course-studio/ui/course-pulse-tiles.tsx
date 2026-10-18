import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { Link } from '#/shared/components/link'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { pulseOptions } from '../queries'

/** The four numbers of the course pulse, from the server's course summary; two open the list behind them. */
export function CoursePulseTiles({ courseId }: { courseId: CourseId }) {
  const { summary } = useSuspenseQuery(pulseOptions(courseId)).data
  return (
    <KpiStrip>
      <KpiTile
        label={m.studio_pulse_enrolled()}
        value={formatNumber(summary.enrolled_learners)}
        action={
          <Link to="/teach/courses/$courseId/learners" params={{ courseId }}>
            {m.studio_pulse_learners()}
          </Link>
        }
      />
      <KpiTile label={m.studio_pulse_active()} value={formatNumber(summary.active_learners_7d)} />
      <KpiTile label={m.studio_pulse_progress()} value={formatPercent(Math.round(summary.avg_progress_pct))} />
      <KpiTile
        label={m.studio_pulse_ungraded()}
        value={formatNumber(summary.ungraded_submissions)}
        action={
          summary.ungraded_submissions > 0 ? (
            <Link to="/teach" search={{ course: courseId }}>
              {m.studio_pulse_inbox()}
            </Link>
          ) : null
        }
      />
    </KpiStrip>
  )
}
