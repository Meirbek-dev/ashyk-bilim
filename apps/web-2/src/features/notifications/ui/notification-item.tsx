import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { m } from '#/paraglide/messages'
import type { Notification, NotificationId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
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
    // On a phone "Mark as read" wraps under the text instead of squeezing it into a narrow column. The whole row is the
    // link's target (a tap on the type or the date opens it too); "Mark as read" sits above it.
    <div ref={row} className="relative flex flex-wrap items-start gap-3">
      <Icon aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 grow basis-56 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{notificationTypeLabels[type]()}</p>
          {unread ? <StatusBadge tone="info">{m.notifications_new()}</StatusBadge> : null}
        </div>
        <Heading className="font-medium wrap-anywhere">
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
        <p className="text-xs text-muted-foreground">{formatDateTime(created_at_unix)}</p>
      </div>
      {unread && !compact ? (
        <SubmitButton
          variant="ghost"
          size="sm"
          className="relative"
          pending={markRead.isPending}
          onClick={() => read(keepFocus)}
        >
          {m.notifications_mark_read()}
        </SubmitButton>
      ) : null}
    </div>
  )
}
