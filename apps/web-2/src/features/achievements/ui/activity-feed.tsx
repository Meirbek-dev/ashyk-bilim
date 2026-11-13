import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { formatDate, formatNumber } from '#/shared/i18n/format'

import { xpHistoryListOptions } from '../queries'
import { sourceLabel } from './source-labels'

/** Every XP award, newest first, with "Show more" by keyset cursor (B-ACH-12). */
export function ActivityFeed() {
  const query = useSuspenseInfiniteQuery(xpHistoryListOptions())
  const awards = query.data.pages.flatMap(page => page.items)
  return (
    <section aria-label={m.achievements_feed_title()} className="flex min-w-0 flex-col gap-3">
      <h2 className="text-xl font-semibold">{m.achievements_feed_title()}</h2>
      <ListState
        pending={false}
        error={query.error}
        count={awards.length}
        filtered={false}
        emptyText={m.achievements_feed_empty()}
        onRetry={() => void query.refetch()}
      >
        <ul className="flex flex-col divide-y border-y">
          {awards.map(award => (
            // What and when on the left, the amount at the line's end, level with the first line.
            <li key={award.id} className="flex items-baseline justify-between gap-4 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p>{sourceLabel[award.source]()}</p>
                {award.reason ? <p className="text-sm wrap-anywhere text-muted-foreground">{award.reason}</p> : null}
                <p className="text-sm text-muted-foreground">{formatDate(award.created_at_unix)}</p>
              </div>
              <p className="shrink-0 font-heading text-base font-semibold tabular-nums">
                {formatNumber(award.amount, { signed: true })}
              </p>
            </li>
          ))}
        </ul>
      </ListState>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </section>
  )
}
