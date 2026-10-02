import { m } from '#/paraglide/messages'
import type { Collection } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'

export function CollectionItem({ collection }: { collection: Collection }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border py-4">
      <h2 className="text-lg font-medium">{collection.name}</h2>
      {collection.description ? <p className="text-muted-foreground">{collection.description}</p> : null}
      <p className="text-sm text-muted-foreground">
        {m.collections_course_count({ count: collection.courses.length })}
        {' · '}
        {m.collections_updated({ date: formatDate(collection.updated_at_unix) })}
      </p>
    </li>
  )
}
