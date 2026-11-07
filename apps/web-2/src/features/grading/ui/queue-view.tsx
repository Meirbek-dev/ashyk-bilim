import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId, FileReviewStats, Stats } from '#/shared/api/gen/types.gen'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'

import { draftsBySubject } from '../model/ai-draft'
import { activeFilters, sortSearch, statusCounts, tableSort } from '../model/queue'
import { draftsOptions, queueOptions, type Work } from '../queries'
import { LearnerSearch } from './learner-search'
import { PrepareDrafts } from './prepare-drafts'
import { QueueFilterRow } from './queue-filter-row'
import { PublishAll } from './publish-all'
import { queueColumns } from './queue-columns'
import { StatusTabs } from './queue-filters'
import { SelectionBar } from './selection-bar'
import { TABLE_LOOK } from './table-look'
import { useRowSelection } from './use-row-selection'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId/submissions'

type QueueViewProps = {
  work: Work
  courseId: CourseId
  /** The server's counts: `stats` of an assessment, `fileSubmissionReviewStats` of a file submission. */
  stats: Stats | FileReviewStats
  /** Publish-all is offered: `grade` in an assessment's `allowed_actions`; a file queue's reader is a grader. */
  canGrade: boolean
}

/**
 * One queue for both kinds of work (B-GRD-01..09, 24, 25): filters, sort and cursor in the URL, server counts; AI drafts
 * beside the grades (B-GRD-40..42).
 */
export function QueueView({ work, courseId, stats, canGrade }: QueueViewProps) {
  const ids = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const navigate = useNavigate({ from: '/teach/courses/$courseId/activities/$activityId/submissions' })
  const query = useSuspenseInfiniteQuery(queueOptions(work, search))
  const { data: draftList } = useSuspenseQuery(draftsOptions(ids.activityId))
  const drafts = draftList ? draftsBySubject(draftList) : null
  const rows = query.data.pages.flatMap(page => page.items)
  const selection = useRowSelection(rows)
  const [selecting, setSelecting] = useState(false)
  const active = activeFilters(search)
  return (
    <ListPage
      title={m.platform_tab_submissions()}
      count={m.grading_queue_count({ count: stats.total })}
      primaryAction={
        <div className="flex flex-wrap items-center gap-2 @2xl:justify-end">
          {drafts && canGrade ? (
            <PrepareDrafts ids={ids} preparing={draftList?.filter(draft => draft.status === 'queued').length ?? 0} />
          ) : null}
          {canGrade ? <PublishAll work={work} courseId={courseId} held={stats.graded} /> : null}
        </div>
      }
      search={<LearnerSearch q={search.q} onSearch={q => navigate({ search: prev => ({ ...prev, q }) })} />}
      filters={
        <QueueFilterRow
          ids={ids}
          search={search}
          courseId={courseId}
          work={work}
          onGroup={group => void navigate({ search: prev => ({ ...prev, group }) })}
          selecting={canGrade ? selecting : null}
          onSelecting={next => {
            setSelecting(next)
            selection.select([])
          }}
        />
      }
      activeFilters={active}
    >
      <StatusTabs ids={ids} search={search} counts={statusCounts(stats)} />
      <SelectionBar
        work={work}
        courseId={courseId}
        rows={selection.picked}
        total={rows.length}
        onAll={() => selection.select(rows.map(row => row.id))}
        onDone={() => selection.select([])}
        drafts={drafts}
        activityId={ids.activityId}
        onKeep={selection.select}
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
        <div className={TABLE_LOOK}>
          <DataTable
            label={m.grading_queue_table()}
            rows={rows}
            columns={queueColumns(ids, search, selecting ? selection : null, drafts)}
            getKey={row => row.id}
            sort={tableSort(search)}
            onSortChange={sort => void navigate({ search: prev => ({ ...prev, ...sortSearch(sort) }) })}
          />
        </div>
      </ListState>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListPage>
  )
}
