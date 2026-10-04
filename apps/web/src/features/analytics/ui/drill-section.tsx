import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentKind, DrillMetric } from '#/shared/api/gen/types.gen'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'

import { drillRows } from '../model/analytics'
import { activeFilters, type Filters } from '../model/filters'
import { drillOptions } from '../queries'
import { drillColumns } from './drill-columns'
import { Pager } from './pager'

type DrillSectionProps = {
  title: string
  metric: DrillMetric
  page: number
  filters: Filters
  /** `pass_rate` drills into one assessment. */
  assessment?: { assessment_type: AssessmentKind; assessment_id: string }
  /** A KPI drill-through is closable (it lives in `?metric=`); an assessment's learners are part of its page. */
  closable?: boolean
}

/** The rows behind a number (drill-through), one numbered page at a time. */
export function DrillSection({ title, metric, page, filters, assessment, closable = false }: DrillSectionProps) {
  const query = useSuspenseQuery(drillOptions(filters, metric, page, assessment))
  const navigate = useNavigate()
  const headingId = useId()
  const rows = drillRows(query.data.items)
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id={headingId} className="text-xl font-semibold">
          {title}
        </h2>
        {closable ? (
          <Link to="." search={prev => ({ ...prev, metric: undefined, page: undefined })}>
            {m.analytics_hide_rows()}
          </Link>
        ) : null}
      </div>
      <ListState
        pending={false}
        error={query.error}
        count={rows.length}
        filtered={activeFilters(filters) > 0}
        emptyText={m.analytics_drill_empty()}
        onResetFilters={() => void navigate({ to: '.', search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable
          label={title}
          rows={rows}
          columns={drillColumns(metric)}
          getKey={row => row.submission_id ?? `${row.user_id}:${row.course_name ?? ''}`}
        />
        <Pager page={page} total={query.data.total} />
      </ListState>
    </section>
  )
}
