import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Notification } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'

import { notificationTarget } from '../model/notifications'
import { markReadOptions } from '../queries'
import { notificationIcons, notificationLines, notificationTypeLabels } from './labels'

type NotificationItemProps = {
  notification: Notification
  /** The bell's panel: an h3 per item and no "Mark as read" (the link reads it). */
  compact?: boolean
  /** Called when the link is followed (the panel closes). */
  onNavigate?: () => void
}

/** One notification: type, what happened (a link to it), when; unread ones are marked "New" (B-NOT-04, B-NOT-05). */
export function NotificationItem({ notification, compact = false, onNavigate }: NotificationItemProps) {
  const markRead = useMutation(markReadOptions(useQueryClient()))
  const { id, type, payload, created_at_unix } = notification
  const unread = notification.read_at_unix === null
  const read = () => {
    if (unread) markRead.mutate({ path: { notification_id: id } })
  }
  const [what = '', ...details] = notificationLines(payload)
  const Icon = notificationIcons[type]
  const Heading = compact ? 'h3' : 'h2'
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{notificationTypeLabels[type]()}</p>
          {unread ? <StatusBadge tone="info">{m.notifications_new()}</StatusBadge> : null}
        </div>
        <Heading className="font-medium wrap-anywhere">
          <Link
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
        <Button variant="ghost" size="sm" disabled={markRead.isPending} onClick={read}>
          {m.notifications_mark_read()}
        </Button>
      ) : null}
    </div>
  )
}
