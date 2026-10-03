import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { notificationsListOptions } from '../queries'
import { NotificationItem } from './notification-item'

/** Newest first, "Show more" by keyset cursor (B-NOT-03); each filter has its own empty text. */
export function NotificationsList({ unread }: { unread: boolean }) {
  const query = useSuspenseInfiniteQuery(notificationsListOptions(unread))
  const notifications = query.data.pages.flatMap(page => page.items)
  return (
    <ListState
      pending={false}
      error={query.error}
      count={notifications.length}
      filtered={false}
      emptyText={unread ? m.notifications_empty_unread() : m.notifications_empty()}
      onRetry={() => void query.refetch()}
    >
      <DataList items={notifications} getKey={notification => notification.id}>
        {notification => <NotificationItem notification={notification} />}
      </DataList>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
