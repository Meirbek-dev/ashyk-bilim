import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { ListPage } from '#/shared/components/templates/list-page'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { markAllReadOptions, unreadOptions } from '../queries'
import { NotificationsList } from './notifications-list'

/** /notifications: the list with its filter in the URL and "Mark all as read" while anything is unread. */
export function NotificationsPage() {
  const { unread = false } = useSearch({ from: '/_authed/notifications' })
  const { data } = useSuspenseQuery(unreadOptions())
  const markAll = useMutation(markAllReadOptions(useQueryClient()))
  const action =
    data.unread_count > 0 ? (
      <Button
        disabled={markAll.isPending}
        onClick={() => markAll.mutate({}, { onSuccess: () => toast.add({ title: m.notifications_marked_all() }) })}
      >
        {markAll.isPending ? <Spinner data-icon="inline-start" /> : null}
        {m.notifications_mark_all()}
      </Button>
    ) : null
  const filter = (
    <nav aria-label={m.notifications_filter_label()} className="flex border-b">
      <Link variant="tab" to="/notifications" search={{ unread: undefined }}>
        {m.notifications_filter_all()}
      </Link>
      <Link variant="tab" to="/notifications" search={{ unread: true }}>
        {m.notifications_filter_unread()}
      </Link>
    </nav>
  )
  return (
    <ListPage title={m.notifications_title()} primaryAction={action} search={filter}>
      <NotificationsList unread={unread} />
    </ListPage>
  )
}
