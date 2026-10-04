import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { formatDate, formatPercent } from '#/shared/i18n/format'

import { learnersOptions } from '../people-queries'
import { RemoveLearner } from './remove-learner'

/** The course's learners, newest first, "Show more" by cursor; "Remove from course" where the row allows it. */
export function LearnersSection({ courseId }: { courseId: string }) {
  const query = useSuspenseInfiniteQuery(learnersOptions(courseId))
  return (
    <section aria-label={m.studio_learners_title()} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{m.studio_learners_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.studio_learners_hint()}</p>
      </div>
      <ListState
        pending={false}
        error={query.error}
        count={query.data.length}
        filtered={false}
        emptyText={m.studio_learners_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataList items={query.data} getKey={learner => learner.user_id}>
          {learner => (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="wrap-anywhere">
                  <Link to="/users/$username" params={{ username: learner.username }}>
                    {learner.display_name || learner.username}
                  </Link>{' '}
                  <span className="text-sm text-muted-foreground">@{learner.username}</span>
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {m.studio_learner_meta({
                    date: formatDate(learner.enrolled_at_unix),
                    progress: formatPercent(learner.progress_pct ?? 0),
                  })}
                </p>
              </div>
              {learner.allowed_actions.includes('remove') ? (
                <RemoveLearner courseId={courseId} learner={learner} />
              ) : null}
            </div>
          )}
        </DataList>
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </section>
  )
}
