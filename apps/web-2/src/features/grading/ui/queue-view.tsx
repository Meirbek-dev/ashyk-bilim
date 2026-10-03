import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId, FileReviewStats, Stats } from '#/shared/api/gen/types.gen'
import { Anchor } from '#/shared/components/anchor'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'
import { buttonVariants } from '#/shared/ui/button'

import { queueCsvHref } from '../model/exports'
import { activeFilters, sortSearch, statusCounts, tableSort } from '../model/queue'
import { queueOptions, type Work } from '../queries'
import { GroupFilter } from './group-filter'
import { LearnerSearch } from './learner-search'
import { PublishAll } from './publish-all'
import { queueColumns } from './queue-columns'
import { QueueFilters } from './queue-filters'
import { SelectionBar } from './selection-bar'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId/submissions'

type QueueViewProps = {
  work: Work
  courseId: CourseId
  /** The server's counts: `stats` of an assessment, `fileSubmissionReviewStats` of a file submission. */
  stats: Stats | FileReviewStats
  /** Publish-all is offered: `grade` in an assessment's `allowed_actions`; a file queue's reader is a grader. */
  canGrade: boolean
}

/** One queue for both kinds of work (B-GRD-01..09, 24, 25): filters, sort and cursor in the URL, server counts. */
export function QueueView({ work, courseId, stats, canGrade }: QueueViewProps) {
  const ids = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const navigate = useNavigate({ from: '/teach/courses/$courseId/activities/$activityId/submissions' })
  const query = useSuspenseInfiniteQuery(queueOptions(work, search))
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const rows = query.data.pages.flatMap(page => page.items)
  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const active = activeFilters(search)
  return (
    <ListPage
      title={m.platform_tab_submissions()}
      count={m.grading_queue_count({ count: stats.total })}
      primaryAction={canGrade ? <PublishAll work={work} courseId={courseId} held={stats.graded} /> : null}
      search={<LearnerSearch q={search.q} onSearch={q => navigate({ search: prev => ({ ...prev, q }) })} />}
      filters={
        <>
          <QueueFilters ids={ids} search={search} counts={statusCounts(stats)} />
          <GroupFilter
            courseId={courseId}
            group={search.group}
            onGroup={group => navigate({ search: prev => ({ ...prev, group }) })}
          />
          <Anchor className={buttonVariants({ variant: 'outline' })} href={queueCsvHref(work.kind, work.id)} download>
            {m.grading_export_csv()}
          </Anchor>
        </>
      }
      activeFilters={active}
    >
      <SelectionBar
        work={work}
        courseId={courseId}
        rows={rows.filter(row => selected.has(row.id))}
        onDone={() => setSelected(new Set())}
      />
      <ListState
        pending={false}
        error={query.error}
        count={rows.length}
        filtered={active > 0}
        emptyText={m.grading_queue_empty()}
        onResetFilters={() => void navigate({ search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable
          label={m.grading_queue_table()}
          rows={rows}
          columns={queueColumns(ids, search, { has: id => selected.has(id), toggle })}
          getKey={row => row.id}
          sort={tableSort(search)}
          onSortChange={sort => void navigate({ search: prev => ({ ...prev, ...sortSearch(sort) }) })}
        />
      </ListState>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListPage>
  )
}
