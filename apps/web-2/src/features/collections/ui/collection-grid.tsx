import type { Collection, CollectionHit } from '#/shared/api/gen/types.gen'

import { CollectionItem } from './collection-item'

/** Collections as books, laid out like the catalog's shelf. */
export function CollectionGrid({ collections }: { collections: readonly (Collection | CollectionHit)[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-10 @lg:grid-cols-2 @4xl:grid-cols-3">
      {collections.map(collection => (
        <li key={collection.id}>
          <CollectionItem collection={collection} />
        </li>
      ))}
    </ul>
  )
}
