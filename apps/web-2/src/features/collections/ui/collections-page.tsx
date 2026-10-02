import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/ui/data-list'
import { ListState } from '#/shared/ui/list-state'
import { ShowMore } from '#/shared/ui/show-more'
import { ListPage } from '#/shared/ui/templates/list-page'

import { collectionsListOptions } from '../queries'
import { CollectionItem } from './collection-item'

/** Public collections list with "show more" (spec 5.6: no page numbers). */
export function CollectionsPage() {
  const query = useSuspenseInfiniteQuery(collectionsListOptions())
  const collections = query.data.pages.flatMap(page => page.items)
  return (
    <ListPage title={m.collections_title()}>
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
    </ListPage>
  )
}
