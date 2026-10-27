import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { foldThreadReplies } from '../model/notifications'
import { notificationsListOptions } from '../queries'
import { emptyListText } from './labels'
import { NotificationItem } from './notification-item'

/** Newest first as one inbox panel (a row each), "Show more" by keyset cursor (B-NOT-03); each filter has its own empty text. */
export function NotificationsList({ unread }: { unread: boolean }) {
  const query = useSuspenseInfiniteQuery(notificationsListOptions(unread))
  const { data: session } = useSuspenseQuery(sessionOptions())
  const rows = foldThreadReplies(query.data.pages.flatMap(page => page.items))
  return (
    <ListState
      pending={false}
      error={query.error}
      count={rows.length}
      filtered={false}
      emptyText={unread ? m.notifications_empty_unread() : emptyListText(hasCapability(session, 'teach'))}
      onRetry={() => void query.refetch()}
    >
      <DataList variant="rows" items={rows} getKey={row => row.notification.id}>
        {row => <NotificationItem notification={row.notification} folded={row.folded} />}
      </DataList>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
