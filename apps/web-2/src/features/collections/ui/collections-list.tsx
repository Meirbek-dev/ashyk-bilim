import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { collectionsListOptions } from '../queries'
import { CollectionGrid } from './collection-grid'

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
      // No dead end: with no collections yet the courses themselves are one click away.
      emptyAction={
        <RouterLink to="/courses" className={buttonVariants({ variant: 'outline' })}>
          {m.collections_to_catalog()}
        </RouterLink>
      }
      onRetry={() => void query.refetch()}
    >
      <CollectionGrid collections={collections} />
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
