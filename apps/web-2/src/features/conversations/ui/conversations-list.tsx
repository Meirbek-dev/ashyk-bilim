import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { conversationsListOptions } from '../queries'
import { ConversationRow } from './conversation-row'

export function ConversationsList({ unread }: { unread: boolean }) {
  const query = useSuspenseInfiniteQuery(conversationsListOptions(unread))
  const { data: session } = useSuspenseQuery(sessionOptions())
  const items = query.data.pages.flatMap(page => page.items)
  return (
    <ListState
      pending={false}
      error={query.error}
      count={items.length}
      filtered={false}
      emptyText={unread ? m.conversations_empty_unread() : m.conversations_empty()}
      onRetry={() => void query.refetch()}
    >
      <div className="-mt-3 [&>ul]:border-t-0">
        <DataList variant="rows" items={items} getKey={item => item.id}>
          {item => <ConversationRow conversation={item} viewer={session?.user_id ?? ''} />}
        </DataList>
      </div>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
