import { m } from '#/paraglide/messages'
import type { LeaderboardEntry } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { UserAvatar } from '#/shared/components/user-avatar'
import { formatNumber } from '#/shared/i18n/format'

/** One place: rank (shared on ties), the person with a link to their profile, level and XP; the viewer's is marked. */
export function LeaderboardRow({ entry, mine }: { entry: LeaderboardEntry; mine: boolean }) {
  return (
    <li className="flex min-h-row items-center gap-3 py-2" aria-current={mine ? 'true' : undefined}>
      <span className="w-10 shrink-0 text-sm text-muted-foreground tabular-nums">#{formatNumber(entry.rank)}</span>
      <UserAvatar name={entry.display_name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="flex flex-wrap items-center gap-2">
          <Link to="/users/$username" params={{ username: entry.username }}>
            <span className="wrap-anywhere">{entry.display_name}</span>
          </Link>
          {mine ? <StatusBadge tone="info">{m.achievements_you()}</StatusBadge> : null}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {m.achievements_summary({ level: entry.level, xp: formatNumber(entry.total_xp) })}
        </p>
      </div>
    </li>
  )
}
