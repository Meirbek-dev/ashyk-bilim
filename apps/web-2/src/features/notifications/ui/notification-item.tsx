import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { m } from '#/paraglide/messages'
import type { Notification, NotificationId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { SubmitButton } from '#/shared/components/submit-button'
import { formatDateTime } from '#/shared/i18n/format'

import { notificationTarget } from '../model/notifications'
import { markReadOptions } from '../queries'
import { notificationIcons, notificationLines, notificationTypeLabels } from './labels'

type NotificationItemProps = {
  notification: Notification
  /** The bell's panel: an h3 per item and no "Mark as read" (the link reads it). */
  compact?: boolean
  /** Called when the link is followed (the panel closes). */
  onNavigate?: () => void
  /** Older unread replies of the same thread shown by this row (foldThreadReplies): read with it. */
  folded?: readonly NotificationId[]
}

/** One notification: type, what happened (a link to it), when; unread ones are marked "New" (B-NOT-04, B-NOT-05). */
export function NotificationItem({ notification, compact = false, onNavigate, folded = [] }: NotificationItemProps) {
  const markRead = useMutation(markReadOptions(useQueryClient()))
  const { id, type, payload, created_at_unix } = notification
  const unread = notification.read_at_unix === null
  const row = useRef<HTMLDivElement>(null)
  const read = (then?: () => void) => {
    if (unread)
      for (const notificationId of [id, ...folded])
        markRead.mutate(
          { path: { notification_id: notificationId } },
          { onSuccess: notificationId === id ? then : undefined },
        )
  }
  // «Отметить прочитанным» goes once the row is read: the keyboard stays on this row (its link), not back at the top.
  const keepFocus = () => {
    const active = document.activeElement
    if (active === null || active === document.body || row.current?.contains(active))
      row.current?.querySelector<HTMLElement>('a[href]')?.focus()
  }
  const [what = '', ...details] = notificationLines(payload, folded.length + 1)
  const Icon = notificationIcons[type]
  const Heading = compact ? 'h3' : 'h2'
  return (
    // The whole row is the link's target (a tap on the type or the date opens it too); "Mark as read" sits above it. In
    // the list the date hangs in its own column from @2xl; the bell's panel is narrow and keeps it under the text.
    <div ref={row} className="relative flex items-start gap-3">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className={`flex min-w-0 flex-1 flex-col gap-3 ${compact ? '' : '@2xl:flex-row @2xl:gap-8'}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
            {notificationTypeLabels[type]()}
            {unread ? <span className="font-medium text-info">{m.notifications_new()}</span> : null}
          </p>
          <Heading className={`wrap-anywhere ${unread ? 'font-semibold' : 'font-normal'}`}>
            <Link
              variant="stretched"
              {...notificationTarget(payload)}
              onClick={() => {
                read()
                onNavigate?.()
              }}
            >
              {what}
            </Link>
          </Heading>
          {details.map(line => (
            <p key={line} className="text-sm wrap-anywhere text-muted-foreground">
              {line}
            </p>
          ))}
          {compact ? <p className="text-xs text-muted-foreground">{formatDateTime(created_at_unix)}</p> : null}
        </div>
        {compact ? null : (
          <div className="flex shrink-0 flex-col items-start gap-1 @2xl:w-40 @2xl:items-end @2xl:text-right">
            <p className="text-sm text-muted-foreground tabular-nums">{formatDateTime(created_at_unix)}</p>
            {unread ? (
              <SubmitButton
                variant="ghost"
                size="sm"
                className="relative -ml-2.5 @2xl:-mr-2.5 @2xl:ml-0"
                pending={markRead.isPending}
                onClick={() => read(keepFocus)}
              >
                {m.notifications_mark_read()}
              </SubmitButton>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
