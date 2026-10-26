import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { SubmitButton } from '#/shared/components/submit-button'
import { ListPage } from '#/shared/components/templates/list-page'
import { formatNumber } from '#/shared/i18n/format'
import { toast } from '#/shared/ui/toast'

import { markAllReadOptions, unreadOptions } from '../queries'
import { NotificationsList } from './notifications-list'

/**
 * /notifications: the list with its filter in the URL (the unread one with its count) and "Mark all as read" while
 * anything is unread.
 */
export function NotificationsPage() {
  const { unread = false } = useSearch({ from: '/_authed/notifications' })
  const { data } = useSuspenseQuery(unreadOptions())
  const markAll = useMutation(markAllReadOptions(useQueryClient()))
  const action =
    data.unread_count > 0 ? (
      <SubmitButton
        variant="outline"
        pending={markAll.isPending}
        onClick={() => markAll.mutate({}, { onSuccess: () => toast.add({ title: m.notifications_marked_all() }) })}
      >
        {m.notifications_mark_all()}
      </SubmitButton>
    ) : null
  const filter = (
    // Full width under the header, as the search page's sections; «Непрочитанные» counts what is left to read.
    <nav aria-label={m.notifications_filter_label()} className="flex w-full overflow-x-auto border-b">
      <Link variant="tab" to="/notifications" search={{ unread: undefined }}>
        {m.notifications_filter_all()}
      </Link>
      <Link variant="tab" to="/notifications" search={{ unread: true }}>
        {m.notifications_filter_unread()}
        {data.unread_count > 0 ? (
          <span className="ml-2 text-muted-foreground tabular-nums">{formatNumber(data.unread_count)}</span>
        ) : null}
      </Link>
    </nav>
  )
  return (
    <ListPage title={m.notifications_title()} primaryAction={action} search={filter}>
      <NotificationsList unread={unread} />
    </ListPage>
  )
}
