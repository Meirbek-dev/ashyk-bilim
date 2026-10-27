import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { AdminRun } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { SheetPanel } from '#/shared/components/sheet-panel'
import { ShowMore } from '#/shared/components/show-more'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'

import { runsFilter, type AdminAiSearch } from '../route'
import { kindLabels, runErrorText, runStatusLabels } from '../model/labels'
import { runsOptions } from '../queries'
import { AdminRunDetail } from './admin-run-detail'
import { RunsFilters } from './runs-filters'

// A function: the headers are read in the current locale at render.
const columns = (): DataColumn<AdminRun>[] => [
  {
    id: 'kind',
    header: m.ai_col_kind(),
    priority: 1,
    cell: run => (
      <Link from="/admin/ai" to="." search={prev => ({ ...prev, run: run.id })}>
        {kindLabels[run.feature]()}
      </Link>
    ),
  },
  {
    id: 'status',
    header: m.ai_col_status(),
    priority: 2,
    cell: run => (
      <span className="flex flex-col items-start gap-1">
        <span className="flex flex-wrap gap-1">
          <StatusBadge tone={run.status === 'failed' ? 'destructive' : 'neutral'}>
            {runStatusLabels[run.status]()}
          </StatusBadge>
          {run.stuck ? <StatusBadge tone="warning">{m.ai_stuck()}</StatusBadge> : null}
        </span>
        {/* Why it failed, in words (the code is in the run's panel): a raw COURSE_ANALYSIS_FAILED column widened
            the table past its edge. */}
        {run.error_code ? <span className="text-sm text-muted-foreground">{runErrorText(run.error_code)}</span> : null}
      </span>
    ),
  },
  { id: 'started', header: m.ai_col_started(), priority: 2, cell: run => formatDateTime(run.started_at_unix) },
  { id: 'model', header: m.ai_col_model(), priority: 3, cell: run => run.model_name },
  {
    id: 'course',
    header: m.ai_col_course(),
    priority: 3,
    wrap: true,
    cell: run =>
      // The course by name (a deleted one has none), and the filter to its runs under it.
      run.context.course_id ? (
        <span className="flex flex-col items-start gap-0.5">
          {run.course_name ? <span className="wrap-anywhere">{run.course_name}</span> : null}
          <span className="text-sm">
            <Link from="/admin/ai" to="." search={prev => ({ ...prev, course: run.context.course_id, run: undefined })}>
              {m.ai_filter_this_course()}
            </Link>
          </span>
        </span>
      ) : null,
  },
]

/** Recent runs, filtered in the URL, keyset "Show more"; `?run=` opens one in a side sheet (B-AI-21, B-AI-22). */
export function AdminRuns({ search }: { search: AdminAiSearch }) {
  const navigate = useNavigate({ from: '/admin/ai' })
  const runs = useSuspenseInfiniteQuery(runsOptions(runsFilter(search)))
  const rows = runs.data.pages.flatMap(page => page.items)
  return (
    <section id="runs" className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.ai_admin_runs()}</h2>
      <RunsFilters search={search} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{m.ai_runs_empty()}</p>
      ) : (
        <DataTable label={m.ai_admin_runs()} rows={rows} columns={columns()} getKey={run => run.id} />
      )}
      <ShowMore hasMore={runs.hasNextPage} pending={runs.isFetchingNextPage} onMore={() => void runs.fetchNextPage()} />
      <SheetPanel
        side="right"
        title={m.ai_open_run()}
        open={search.run !== undefined}
        onOpenChange={open => {
          if (!open) void navigate({ search: prev => ({ ...prev, run: undefined }) })
        }}
      >
        {search.run ? (
          <Suspense fallback={<ListSkeleton />}>
            <AdminRunDetail runId={search.run} />
          </Suspense>
        ) : null}
      </SheetPanel>
    </section>
  )
}
