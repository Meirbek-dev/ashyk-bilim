import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { ReactElement } from 'react'

import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { buttonVariants } from '#/shared/components/button-variants'

import { gradebookCsvHref } from '../model/exports'
import { gradebookColumns, gradebookRows, gradebookSummary } from '../model/gradebook'
import { curriculumOptions, gradebookOptions } from '../queries'
import { gradebookFooter, gradebookTableColumns } from './gradebook-columns'
import { GroupFilter } from './group-filter'
import { scoreText } from './labels'
import { LearnerSearch } from './learner-search'

const ROUTE = '/_authed/teach/courses/$courseId/gradebook'

// ponytail: a plain table (100 learners per page x the course's graded activities); virtualize when a measured
// course makes it slow.
/** The course gradebook (B-GRD-19..21, B-GRD-24, B-GRD-37): learners x graded activities, cards per learner when narrow. */
export function GradebookPage(): ReactElement {
  const { courseId } = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const navigate = useNavigate({ from: '/teach/courses/$courseId/gradebook' })
  const query = useSuspenseInfiniteQuery(gradebookOptions(courseId, search))
  const rows = gradebookRows(query.data.pages)
  const { data: curriculum } = useSuspenseQuery(curriculumOptions(courseId))
  const columns = gradebookTableColumns(courseId, gradebookColumns(query.data.pages, curriculum))
  const active = [search.q, search.pending, search.group].filter(Boolean).length
  const summary = gradebookSummary(query.data.pages)
  return (
    <section aria-labelledby="grading-gradebook" className="@container flex flex-col gap-gutter">
      <div className="flex flex-col gap-1">
        <h2 id="grading-gradebook" className="text-xl font-semibold">
          {m.grading_gradebook_table()}
        </h2>
        {rows.length > 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {summary?.course_average != null
              ? `${m.grading_course_average({ value: scoreText(summary.course_average) })} `
              : null}
            {m.grading_total_legend()}
          </p>
        ) : null}
      </div>
      {/* No learner at all (and no filter): nothing to search, filter or export - only the empty state. */}
      {rows.length === 0 && active === 0 ? null : (
        <div className="flex flex-wrap items-end gap-2">
          <LearnerSearch q={search.q} onSearch={q => navigate({ search: prev => ({ ...prev, q }) })} />
          <RouterLink
            to="/teach/courses/$courseId/gradebook"
            params={{ courseId }}
            search={{ ...search, pending: search.pending ? undefined : true }}
            aria-current={search.pending ? 'true' : undefined}
            className={buttonVariants({ variant: search.pending ? 'secondary' : 'outline' })}
          >
            {search.pending ? <Check aria-hidden data-icon="inline-start" /> : null}
            {m.grading_pending_only()}
          </RouterLink>
          <GroupFilter
            courseId={courseId}
            group={search.group}
            onGroup={group => navigate({ search: prev => ({ ...prev, group }) })}
          />
          <Anchor className={buttonVariants({ variant: 'outline' })} href={gradebookCsvHref(courseId)} download>
            {m.grading_export_csv()}
          </Anchor>
        </div>
      )}
      <ListState
        pending={false}
        error={query.error}
        count={rows.length}
        filtered={active > 0}
        emptyText={m.grading_gradebook_empty()}
        onResetFilters={() => void navigate({ search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable
          label={m.grading_gradebook_table()}
          rows={rows}
          columns={columns}
          getKey={row => row.user.id}
          footer={summary ? gradebookFooter(summary) : undefined}
        />
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </section>
  )
}
