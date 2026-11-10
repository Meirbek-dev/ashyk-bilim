import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { Message } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { UserAvatar } from '#/shared/components/user-avatar'
import { formatDateTime, formatTime } from '#/shared/i18n/format'

import { contextTarget, contextText, type FeedRow } from '../model/feed'
import { DeleteMessage } from './delete-message'
import { ReportMessage } from './report-message'

type FeedRowsProps = { rows: readonly FeedRow[]; peerName: string; peerAvatar: string | null }

/**
 * The feed's items (docs/DIALOGS.md 9): lines on the page, not bubbles. One's own message carries the start border
 * (as a user's turn in the AI feed); the header (avatar, name, time) only where the author or the moment changes.
 */
export function FeedRows({ rows, peerName, peerAvatar }: FeedRowsProps) {
  return rows.map(row => {
    if (row.kind === 'day')
      return (
        <li key={row.key} className="flex items-center gap-3 py-3 text-xs text-muted-foreground">
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span>{row.label}</span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </li>
      )
    if (row.kind === 'new')
      return (
        <li key={row.key} data-new className="flex items-center gap-3 py-2 text-xs font-medium text-info">
          <span>{m.conversations_new_divider()}</span>
          <span aria-hidden className="h-px flex-1 bg-info/40" />
        </li>
      )
    return (
      <MessageRow
        key={row.key}
        message={row.message}
        header={row.header}
        own={row.own}
        name={row.own ? m.conversations_you() : peerName}
        avatar={row.own ? null : peerAvatar}
      />
    )
  })
}

type MessageRowProps = { message: Message; header: boolean; own: boolean; name: string; avatar: string | null }

function MessageRow({ message, header, own, name, avatar }: MessageRowProps) {
  const canDelete = message.allowed_actions.includes('delete')
  const canReport = message.allowed_actions.includes('report')
  return (
    <li
      data-message
      id={`message-${message.id}`}
      className={`flex gap-3 ${header ? 'pt-3' : 'pt-1'} ${own ? 'border-s-2 ps-3' : ''}`}
    >
      <div className="w-8 shrink-0">{header && !own ? <UserAvatar name={name} avatarKey={avatar} /> : null}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {header ? (
          <p className="flex items-baseline gap-2 text-sm">
            <span className="font-medium">{name}</span>
            <time
              className="text-xs text-muted-foreground tabular-nums"
              dateTime={new Date(message.created_at_unix * 1000).toISOString()}
              title={formatDateTime(message.created_at_unix)}
            >
              {formatTime(message.created_at_unix)}
            </time>
          </p>
        ) : (
          <span className="sr-only">{`${name}, ${formatTime(message.created_at_unix)}`}</span>
        )}
        {message.context && !message.deleted ? (
          <p className="text-xs text-muted-foreground">
            <Link {...contextTarget(message.context)}>{contextText(message.context)}</Link>
          </p>
        ) : null}
        {message.deleted ? (
          <p className="text-sm text-muted-foreground italic">{m.conversations_deleted()}</p>
        ) : (
          <div className="min-w-0 wrap-anywhere">
            <MarkdownView content={message.body} />
          </div>
        )}
      </div>
      {canDelete || canReport ? (
        <div className="flex shrink-0 items-start">
          {canDelete ? <DeleteMessage message={message} /> : null}
          {canReport ? <ReportMessage message={message} /> : null}
        </div>
      ) : null}
    </li>
  )
}
