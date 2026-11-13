import type { Collection, CollectionHit } from '#/shared/api/gen/types.gen'

import { CollectionItem } from './collection-item'

/** Collections as books, laid out like the catalog's shelf: the cards of a row share their lines (subgrid). */
export function CollectionGrid({ collections }: { collections: readonly (Collection | CollectionHit)[] }) {
  return (
    <div className="flow-root">
      <ul className="-mb-10 grid gap-x-6 @lg:grid-cols-2 @4xl:grid-cols-3">
        {collections.map(collection => (
          <li key={collection.id} className="row-span-4 grid grid-rows-subgrid pb-10">
            <CollectionItem collection={collection} />
          </li>
        ))}
      </ul>
    </div>
  )
}
