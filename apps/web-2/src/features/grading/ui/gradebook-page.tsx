import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import type { ReactElement } from 'react'

import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { buttonVariants } from '#/shared/ui/button'

import { gradebookCsvHref } from '../model/exports'
import { filterRows, gradebookColumns, gradebookRows } from '../model/gradebook'
import { gradebookOptions } from '../queries'
import { gradebookTableColumns } from './gradebook-columns'
import { LearnerSearch } from './learner-search'

const ROUTE = '/_authed/teach/courses/$courseId/gradebook'

// ponytail: a plain table (100 learners per page x the course's graded activities); virtualize when a measured
// course makes it slow.
/** The course gradebook (B-GRD-19..21): learners x graded activities, cards per learner when narrow. */
export function GradebookPage(): ReactElement {
  const { courseId } = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const navigate = useNavigate({ from: '/teach/courses/$courseId/gradebook' })
  const query = useSuspenseInfiniteQuery(gradebookOptions(courseId))
  const rows = gradebookRows(query.data.pages)
  const shown = filterRows(rows, search)
  const columns = gradebookTableColumns(courseId, gradebookColumns(query.data.pages))
  const active = [search.q, search.pending].filter(Boolean).length
  return (
    <section aria-labelledby="grading-gradebook" className="@container flex flex-col gap-gutter">
      <h2 id="grading-gradebook" className="text-xl font-semibold">
        {m.grading_gradebook_table()}
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <LearnerSearch q={search.q} onSearch={q => navigate({ search: prev => ({ ...prev, q }) })} />
        <Link
          to="/teach/courses/$courseId/gradebook"
          params={{ courseId }}
          search={{ ...search, pending: search.pending ? undefined : true }}
          activeOptions={{ exact: true, includeSearch: true }}
          variant="tab"
        >
          {m.grading_pending_only()}
        </Link>
        <Anchor className={buttonVariants({ variant: 'outline' })} href={gradebookCsvHref(courseId)} download>
          {m.grading_export_csv()}
        </Anchor>
      </div>
      <ListState
        pending={false}
        error={query.error}
        count={shown.length}
        filtered={active > 0}
        emptyText={m.grading_gradebook_empty()}
        onResetFilters={() => void navigate({ search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable label={m.grading_gradebook_table()} rows={shown} columns={columns} getKey={row => row.user.id} />
      </ListState>
      {/* Outside ListState: the filters narrow loaded pages only, so the next page may still hold matches. */}
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </section>
  )
}
