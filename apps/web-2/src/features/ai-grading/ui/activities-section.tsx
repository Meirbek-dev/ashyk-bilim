import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { ActivityDraftStats, CourseId } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { formatNumber } from '#/shared/i18n/format'

const count = (value: number) => <span className="tabular-nums">{formatNumber(value)}</span>

const columns = (courseId: CourseId): DataColumn<ActivityDraftStats>[] => [
  { id: 'name', header: m.ai_grading_col_activity(), priority: 1, cell: row => row.activity_name },
  { id: 'drafts', header: m.ai_grading_col_drafts(), priority: 2, cell: row => count(row.drafts) },
  { id: 'ready', header: m.ai_grading_col_ready(), priority: 2, cell: row => count(row.ready) },
  { id: 'applied', header: m.ai_grading_col_applied(), priority: 2, cell: row => count(row.applied) },
  {
    id: 'action',
    header: m.ai_grading_col_action(),
    headerCell: <span className="sr-only">{m.ai_grading_col_action()}</span>,
    priority: 2,
    action: true,
    cell: row => (
      <RouterLink
        className={`-mx-3 ${buttonVariants({ variant: 'ghost', size: 'sm' })}`}
        to="/teach/courses/$courseId/activities/$activityId/submissions"
        params={{ courseId, activityId: row.activity_id }}
        search={{}}
      >
        {m.ai_grading_open_queue()}
      </RouterLink>
    ),
  },
]

/** The course's activities with AI drafts in the period (B-AIG-04), each leading to its submissions queue. */
export function ActivitiesSection({ courseId, rows }: { courseId: CourseId; rows: readonly ActivityDraftStats[] }) {
  return (
    <section aria-labelledby="ai-grading-activities" className="flex flex-col gap-4">
      <h2 id="ai-grading-activities" className="text-xl font-semibold">
        {m.ai_grading_activities_title()}
      </h2>
      <ListState
        pending={false}
        error={null}
        count={rows.length}
        filtered={false}
        emptyText={m.ai_grading_activities_empty()}
        onRetry={() => undefined}
      >
        <div className="[&_td:first-child]:ps-0 [&_td:last-child]:pe-0 [&_td:nth-child(n+2)]:text-right [&_th:first-child]:ps-0 [&_th:nth-child(n+2)]:text-right">
          <DataTable
            label={m.ai_grading_activities_title()}
            rows={rows}
            columns={columns(courseId)}
            getKey={row => row.activity_id}
          />
        </div>
      </ListState>
    </section>
  )
}
