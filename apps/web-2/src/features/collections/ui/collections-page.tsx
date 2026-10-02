import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { collectionsListOptions } from '../queries'
import { CollectionItem } from './collection-item'

/** Public collections list with "show more" (spec 5.6: no page numbers). ListState arrives with the kit. */
export function CollectionsPage() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(collectionsListOptions())
  const collections = data.pages.flatMap(page => page.items)
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{m.collections_title()}</h1>
      {collections.length === 0 ? (
        <p className="text-muted-foreground">{m.collections_empty()}</p>
      ) : (
        <ul>
          {collections.map(collection => (
            <CollectionItem key={collection.id} collection={collection} />
          ))}
        </ul>
      )}
      {hasNextPage ? (
        <div>
          <Button variant="quiet" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {m.collections_show_more()}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
