import { m } from '#/paraglide/messages'
import type { Conversation } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { UserAvatar } from '#/shared/components/user-avatar'
import { formatDate, formatNumber, formatTime, platformDay } from '#/shared/i18n/format'
import { lastMessageText, personName } from '../model/feed'

/** Today's messages by their time, older ones by their date. */
const when = (unix: number) =>
  platformDay(unix) === platformDay(Math.floor(Date.now() / 1000)) ? formatTime(unix) : formatDate(unix)

/** One row: the person, the last message's opening, when, and how many are new; the whole row opens the feed. */
export function ConversationRow({ conversation, viewer }: { conversation: Conversation; viewer: string }) {
  const { peer, last_message: last, unread_count: unreadCount } = conversation
  const name = personName(peer)
  return (
    <div className="relative flex items-center gap-3">
      <UserAvatar name={name} avatarKey={peer.avatar_key} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className={`truncate ${unreadCount > 0 ? 'font-semibold' : 'font-normal'}`}>
          <Link variant="stretched" to="/conversations/$conversationId" params={{ conversationId: conversation.id }}>
            {name}
          </Link>
        </h2>
        <p className={`truncate text-sm ${last?.deleted ? 'text-muted-foreground italic' : 'text-muted-foreground'}`}>
          {lastMessageText(last, viewer)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {last ? <p className="text-xs text-muted-foreground tabular-nums">{when(last.created_at_unix)}</p> : null}
        {unreadCount > 0 ? (
          <span className="rounded-full bg-highlight px-1.5 text-xs leading-5 text-highlight-foreground tabular-nums">
            <span aria-hidden>{formatNumber(unreadCount)}</span>
            <span className="sr-only">{m.conversations_unread_count({ count: unreadCount })}</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
