import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseLearner } from '#/shared/api/gen/types.gen'
import { ScoreBar } from '#/shared/components/charts/score-bar'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { UserAvatar } from '#/shared/components/user-avatar'
import { formatDate, formatPercent } from '#/shared/i18n/format'

import { learnersOptions } from '../people-queries'
import { ExportLearners } from './export-learners'
import { LearnersSearchBox } from './learners-search'
import { RemoveLearner } from './remove-learner'

const ROUTE = '/_authed/teach/courses/$courseId/learners'
const ROUTE_PATH = '/teach/courses/$courseId/learners'

const date = (unix: number | null) => <span className="tabular-nums">{unix === null ? '—' : formatDate(unix)}</span>

// `removable`: some row allows «remove» - without it (a co-author) the action column would be a header over empty cells.
const columns = (courseId: string, removable: boolean): DataColumn<CourseLearner>[] => [
  {
    id: 'learner',
    header: m.studio_learners_col_learner(),
    priority: 1,
    cell: learner => (
      <span className="flex items-center gap-3">
        <UserAvatar name={learner.display_name || learner.username} avatarKey={learner.avatar_key} />
        <span className="flex min-w-48 flex-col wrap-anywhere">
          <Link to="/users/$username" params={{ username: learner.username }}>
            {learner.display_name || learner.username}
          </Link>
          <span className="text-sm font-normal text-muted-foreground">
            @{learner.username} · {learner.email}
          </span>
        </span>
      </span>
    ),
  },
  {
    id: 'progress',
    header: m.studio_learners_col_progress(),
    priority: 2,
    cell: learner => (
      <span className="flex flex-col items-start gap-1">
        <ScoreBar value={learner.progress_pct ?? 0} text={formatPercent(learner.progress_pct ?? 0)} />
        {learner.completed_at_unix === null ? null : (
          <span className="text-xs text-muted-foreground">
            {m.studio_learner_completed({ date: formatDate(learner.completed_at_unix) })}
          </span>
        )}
      </span>
    ),
  },
  {
    id: 'active',
    header: m.studio_learners_col_active(),
    priority: 2,
    cell: learner => date(learner.last_activity_at_unix),
  },
  {
    id: 'enrolled',
    header: m.studio_roster_col_enrolled(),
    priority: 3,
    cell: learner => date(learner.enrolled_at_unix),
  },
  ...(removable
    ? [
        {
          id: 'action',
          header: m.studio_learners_col_action(),
          priority: 2 as const,
          action: true,
          cell: (learner: CourseLearner) =>
            learner.allowed_actions.includes('remove') ? <RemoveLearner courseId={courseId} learner={learner} /> : null,
        },
      ]
    : []),
]

/**
 * The course's learners (B-CST-35): a table of who enrolled (newest first) with their progress, last activity and
 * enrolment date; search in `?q=`, CSV export, "Show more" by cursor; "Remove from course" where the row allows it.
 * `add` is the "Add learners" button of roster managers.
 */
export function LearnersSection({
  courseId,
  courseName,
  add,
}: {
  courseId: string
  courseName: string
  add: ReactNode
}) {
  const { q } = useSearch({ from: ROUTE })
  const navigate = useNavigate()
  const query = useSuspenseInfiniteQuery(learnersOptions(courseId, q))
  return (
    <section aria-label={m.studio_learners_title()} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{m.studio_learners_title()}</h2>
          <p className="text-sm text-muted-foreground">{m.studio_learners_hint()}</p>
        </div>
        {add}
      </div>
      {/* Nobody enrolled (and no search): nothing to search or export. */}
      {query.data.length === 0 && !q ? null : (
        <div className="flex flex-wrap items-end gap-2">
          <LearnersSearchBox key={q ?? ''} q={q} />
          {query.data.length > 0 && !q ? <ExportLearners courseId={courseId} courseName={courseName} /> : null}
        </div>
      )}
      <ListState
        pending={false}
        error={query.error}
        count={query.data.length}
        filtered={Boolean(q)}
        onResetFilters={() => void navigate({ to: ROUTE_PATH, params: { courseId }, search: {} })}
        emptyText={m.studio_learners_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataTable
          label={m.studio_learners_title()}
          rows={query.data}
          columns={columns(
            courseId,
            query.data.some(learner => learner.allowed_actions.includes('remove')),
          )}
          getKey={learner => learner.user_id}
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
