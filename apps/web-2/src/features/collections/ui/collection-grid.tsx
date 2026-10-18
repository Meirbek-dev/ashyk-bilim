import type { Collection, CollectionHit } from '#/shared/api/gen/types.gen'

import { CollectionItem } from './collection-item'

/** Collections as cover cards, laid out like the catalog's course grid. */
export function CollectionGrid({ collections }: { collections: readonly (Collection | CollectionHit)[] }) {
  return (
    <ul className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
      {collections.map(collection => (
        <li key={collection.id}>
          <CollectionItem collection={collection} />
        </li>
      ))}
    </ul>
  )
}
