import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { formatNumber } from '#/shared/i18n/format'

import { leaderboardListOptions } from '../queries'
import { LeaderboardRow } from './leaderboard-row'

/**
 * The public board, 20 places per "Show more". The viewer's place is stated above it even when their row is not
 * loaded (UX-185); their row is found by user id, never by rank (ties share a rank, UX-172).
 */
export function LeaderboardSection({ rank }: { rank: number | null }) {
  const { session } = useRouteContext({ from: '/_authed' })
  const query = useSuspenseInfiniteQuery(leaderboardListOptions())
  const rows = query.data.pages.flatMap(page => page.entries)
  const total = query.data.pages.at(-1)?.total_participants ?? rows.length
  return (
    <section aria-label={m.achievements_leaderboard_title()} className="flex max-w-prose flex-col gap-3">
      <h2 className="text-xl font-semibold">{m.achievements_leaderboard_title()}</h2>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <span>
          {rank === null
            ? m.achievements_hidden()
            : m.achievements_your_place({ rank: formatNumber(rank), total: formatNumber(total) })}
        </span>
        <Link to="/settings/notifications">{m.achievements_visibility_link()}</Link>
      </p>
      <ListState
        pending={false}
        error={query.error}
        count={rows.length}
        filtered={false}
        emptyText={m.achievements_leaderboard_empty()}
        onRetry={() => void query.refetch()}
      >
        <ol className="flex flex-col divide-y">
          {rows.map(entry => (
            <LeaderboardRow key={entry.user_id} entry={entry} mine={entry.user_id === session.user_id} />
          ))}
        </ol>
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </section>
  )
}
