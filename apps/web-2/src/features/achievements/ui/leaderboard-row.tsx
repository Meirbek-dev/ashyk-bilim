import { m } from '#/paraglide/messages'
import type { LeaderboardEntry } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'
import { Avatar } from '#/shared/ui/avatar'
import { Badge } from '#/shared/ui/badge'
import { Link } from '#/shared/ui/link'

/** One place: rank (shared on ties), the person with a link to their profile, level and XP; the viewer's is marked. */
export function LeaderboardRow({ entry, mine }: { entry: LeaderboardEntry; mine: boolean }) {
  return (
    <li className="flex min-h-row items-center gap-3 py-2" aria-current={mine ? 'true' : undefined}>
      <span className="w-10 shrink-0 text-sm text-muted-foreground tabular-nums">#{formatNumber(entry.rank)}</span>
      <Avatar name={entry.display_name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="flex flex-wrap items-center gap-2">
          <Link to="/users/$username" params={{ username: entry.username }}>
            <span className="wrap-anywhere">{entry.display_name}</span>
          </Link>
          {mine ? <Badge tone="info">{m.achievements_you()}</Badge> : null}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {m.achievements_summary({ level: entry.level, xp: formatNumber(entry.total_xp) })}
        </p>
      </div>
    </li>
  )
}
