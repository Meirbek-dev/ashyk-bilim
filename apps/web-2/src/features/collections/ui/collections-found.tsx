import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/ui/data-list'
import { ListState } from '#/shared/ui/list-state'

import { collectionsSearchOptions } from '../queries'
import { CollectionItem } from './collection-item'

/** The collections a `?q=` search found (at most SEARCH_LIMIT, no cursor: the search API has none). */
export function CollectionsFound({ q }: { q: string }) {
  const query = useSuspenseQuery(collectionsSearchOptions(q))
  const navigate = useNavigate()
  return (
    <ListState
      pending={false}
      error={query.error}
      count={query.data.length}
      filtered
      emptyText={m.collections_empty()}
      onResetFilters={() => void navigate({ to: '/collections', search: {} })}
      onRetry={() => void query.refetch()}
    >
      <DataList items={query.data} getKey={collection => collection.id}>
        {collection => <CollectionItem collection={collection} />}
      </DataList>
    </ListState>
  )
}
