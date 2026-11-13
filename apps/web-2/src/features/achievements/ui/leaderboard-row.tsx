import { m } from '#/paraglide/messages'
import type { LeaderboardEntry } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { UserAvatar } from '#/shared/components/user-avatar'
import { formatNumber } from '#/shared/i18n/format'

// The viewer's own place: a solid mark in the margin, in the accent of the current tab.
const marked = 'before:absolute before:inset-y-2 before:-left-3 before:border-l-2 before:border-foreground'

/**
 * One place, typeset as a table row: the rank (shared on ties) right-aligned in its own column, the person with a link
 * to their profile on one line (the full name is the tooltip), level and XP at the line's end from @lg.
 */
export function LeaderboardRow({ entry, mine }: { entry: LeaderboardEntry; mine: boolean }) {
  return (
    <li
      className={`relative flex items-center gap-3 py-2 ${mine ? marked : ''}`}
      aria-current={mine ? 'true' : undefined}
    >
      <span
        className={`w-8 shrink-0 text-right font-heading text-base font-semibold tabular-nums ${entry.rank <= 3 ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        <span className="sr-only">#</span>
        {formatNumber(entry.rank)}
      </span>
      <UserAvatar name={entry.display_name} avatarKey={entry.avatar_key} />
      <div className="flex min-w-0 flex-1 flex-col gap-x-4 @lg:flex-row @lg:items-baseline @lg:justify-between">
        <p className="flex min-w-0 items-baseline gap-x-2">
          <Link variant="stretched" to="/users/$username" params={{ username: entry.username }}>
            <span className="line-clamp-1 wrap-anywhere" title={entry.display_name}>
              {entry.display_name}
            </span>
          </Link>
          {mine ? <span className="shrink-0 text-sm text-muted-foreground">{m.achievements_you()}</span> : null}
        </p>
        <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {m.achievements_summary({ level: entry.level, xp: formatNumber(entry.total_xp) })}
        </p>
      </div>
    </li>
  )
}
