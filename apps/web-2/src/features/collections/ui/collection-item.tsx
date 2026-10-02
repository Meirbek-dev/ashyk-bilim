import { m } from '#/paraglide/messages'
import type { Collection } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'

/** One collection card's content (inside DataList). */
export function CollectionItem({ collection }: { collection: Collection }) {
  return (
    <>
      <h2 className="text-lg font-medium">{collection.name}</h2>
      {collection.description ? <p className="text-muted-foreground">{collection.description}</p> : null}
      <p className="text-sm text-muted-foreground">
        {m.collections_course_count({ count: collection.courses.length })}
        {' · '}
        {m.collections_updated({ date: formatDate(collection.updated_at_unix) })}
      </p>
    </>
  )
}
