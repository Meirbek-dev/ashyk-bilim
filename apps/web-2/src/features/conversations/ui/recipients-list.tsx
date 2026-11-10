import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { recipientsOptions } from '../queries'
import { RecipientRow } from './recipient-row'

export function Recipients({ q }: { q: string }) {
  const query = useSuspenseInfiniteQuery(recipientsOptions(q, undefined))
  const items = query.data.pages.flatMap(page => page.items)
  return (
    <ListState
      pending={false}
      error={query.error}
      count={items.length}
      filtered={false}
      emptyText={m.conversations_recipients_empty()}
      onRetry={() => void query.refetch()}
    >
      <DataList variant="rows" items={items} getKey={item => `${item.person.id}-${item.course_id}`}>
        {item => <RecipientRow recipient={item} />}
      </DataList>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
