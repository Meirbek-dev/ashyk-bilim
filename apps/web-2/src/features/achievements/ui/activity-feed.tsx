import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { formatDate, formatNumber } from '#/shared/i18n/format'
import { ListState } from '#/shared/ui/list-state'

import { achievementsOptions } from '../queries'
import { sourceLabel } from './source-labels'

/** The latest XP awards (the API returns the 10 newest; no history operation yet). */
export function ActivityFeed() {
  const query = useSuspenseQuery(achievementsOptions())
  const awards = query.data.recent_transactions
  return (
    <section aria-label={m.achievements_feed_title()} className="flex max-w-prose flex-col gap-3">
      <h2 className="text-xl font-semibold">{m.achievements_feed_title()}</h2>
      <ListState
        pending={false}
        error={query.error}
        count={awards.length}
        filtered={false}
        emptyText={m.achievements_feed_empty()}
        onRetry={() => void query.refetch()}
      >
        <ul className="flex flex-col divide-y">
          {awards.map(award => (
            <li key={award.id} className="flex items-start justify-between gap-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-medium">{sourceLabel[award.source]()}</p>
                {award.reason ? <p className="text-sm wrap-anywhere">{award.reason}</p> : null}
                <p className="text-sm text-muted-foreground">{formatDate(award.created_at_unix)}</p>
              </div>
              <p className="shrink-0 font-medium tabular-nums">{formatNumber(award.amount, { signed: true })}</p>
            </li>
          ))}
        </ul>
      </ListState>
    </section>
  )
}
