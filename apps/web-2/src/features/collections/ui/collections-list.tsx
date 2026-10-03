import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { collectionsListOptions } from '../queries'
import { CollectionItem } from './collection-item'

/** Newest first, "Show more" by keyset cursor (spec 5.6). The create action stays in the page header. */
export function CollectionsList() {
  const query = useSuspenseInfiniteQuery(collectionsListOptions())
  const collections = query.data.pages.flatMap(page => page.items)
  return (
    <ListState
      pending={false}
      error={query.error}
      count={collections.length}
      filtered={false}
      emptyText={m.collections_empty()}
      onRetry={() => void query.refetch()}
    >
      <DataList items={collections} getKey={collection => collection.id}>
        {collection => <CollectionItem collection={collection} />}
      </DataList>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
