import { m } from '#/paraglide/messages'
import type { Collection, CollectionHit } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'
import { collectionVisibilityLabels } from '#/shared/i18n/labels'
import { Badge } from '#/shared/ui/badge'
import { Link } from '#/shared/ui/link'

/** One collection card's content (inside DataList): a list item has its meta line, a search hit has none. */
export function CollectionItem({ collection }: { collection: Collection | CollectionHit }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 text-lg font-medium wrap-anywhere">
          <Link to="/collections/$collectionId" params={{ collectionId: collection.id }}>
            {collection.name}
          </Link>
        </h2>
        {/* A guest sees only public ones; the badge marks the caller's own hidden collections (B-COL-05). */}
        {collection.public ? null : <Badge tone="neutral">{collectionVisibilityLabels.private()}</Badge>}
      </div>
      {collection.description ? <p className="wrap-anywhere text-muted-foreground">{collection.description}</p> : null}
      {'courses' in collection ? (
        <p className="text-sm text-muted-foreground">
          {m.collections_course_count({ count: collection.courses.length })}
          {' · '}
          {m.collections_updated({ date: formatDate(collection.updated_at_unix) })}
        </p>
      ) : null}
    </>
  )
}
