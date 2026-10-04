import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { formatNumber } from '#/shared/i18n/format'

import { QUEUE_STATUSES, type QueueSearch, type QueueStatus } from '../route'
import { filterLabels } from './labels'

const QUEUE = '/teach/courses/$courseId/activities/$activityId/submissions'

type QueueFiltersProps = {
  ids: { courseId: string; activityId: string }
  search: QueueSearch
  /** The server's count per status. */
  counts: Record<QueueStatus, number>
}

/**
 * Status filter as links (`?status=`) with the server's counts (B-GRD-02, B-GRD-05), and "Late only" (`?late=true`)
 * as a link that toggles it.
 */
export function QueueFilters({ ids, search, counts }: QueueFiltersProps) {
  const options = [
    { status: undefined, label: m.grading_filter_all() },
    ...QUEUE_STATUSES.map(status => ({ status, label: filterLabels[status]() })),
  ]
  return (
    <>
      <nav aria-label={m.grading_status_label()} className="flex flex-wrap">
        {options.map(option => (
          <Link
            key={option.status ?? 'all'}
            to={QUEUE}
            params={ids}
            search={{ ...search, status: option.status }}
            activeOptions={{ exact: true, includeSearch: true }}
            variant="tab"
          >
            <span className="flex items-center gap-1">
              {option.label}
              {option.status ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(counts[option.status])}
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </nav>
      <Link
        to={QUEUE}
        params={ids}
        search={{ ...search, late: search.late ? undefined : true }}
        activeOptions={{ exact: true, includeSearch: true }}
        variant="tab"
      >
        {m.grading_late_only()}
      </Link>
    </>
  )
}
