import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { Link } from '#/shared/components/link'
import { formatNumber } from '#/shared/i18n/format'

import type { QueueStatus } from '../route'

/** The works list a count stands for: everything, one status, or the late ones. */
export type CountFilter = { status?: QueueStatus; late?: true }

/**
 * A results count with «Показать работы» into the activity's works list, filtered to what it counts (B-GRD-18); a zero
 * has nothing to show and no link.
 */
export function CountTile({ label, value, filter }: { label: string; value: number; filter: CountFilter }) {
  const { courseId, activityId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  return (
    <KpiTile
      label={label}
      value={formatNumber(value)}
      action={
        value > 0 ? (
          <Link
            to="/teach/courses/$courseId/activities/$activityId/submissions"
            params={{ courseId, activityId }}
            search={filter}
          >
            {m.grading_show_works()}
          </Link>
        ) : null
      }
    />
  )
}
