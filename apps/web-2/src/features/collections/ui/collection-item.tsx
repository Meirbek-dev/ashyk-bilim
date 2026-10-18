import { m } from '#/paraglide/messages'
import type { Collection, CollectionHit } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'
import { collectionVisibilityLabels } from '#/shared/i18n/labels'

/**
 * One collection card: its cover (uploaded, else the ornament of its id), name (the whole card opens it),
 * description; a list item has its meta line, a search hit has neither cover nor meta.
 */
export function CollectionItem({ collection }: { collection: Collection | CollectionHit }) {
  const full = 'courses' in collection ? collection : null
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs transition-colors hover:border-input">
      <CourseCover seed={collection.id} imageKey={full?.cover_key} className="aspect-video w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-lg font-semibold wrap-anywhere">
            <Link variant="stretched" to="/collections/$collectionId" params={{ collectionId: collection.id }}>
              {collection.name}
            </Link>
          </h2>
          {/* A guest sees only public ones; the badge marks the caller's own hidden collections (B-COL-05). */}
          {collection.public ? null : <StatusBadge tone="neutral">{collectionVisibilityLabels.private()}</StatusBadge>}
        </div>
        {collection.description ? (
          <p className="line-clamp-2 text-sm wrap-anywhere text-muted-foreground">{collection.description}</p>
        ) : null}
        {full ? (
          <p className="mt-auto pt-2 text-xs text-muted-foreground">
            {m.collections_course_count({ count: full.courses.length })}
            {' · '}
            {m.collections_updated({ date: formatDate(full.updated_at_unix) })}
          </p>
        ) : null}
      </div>
    </article>
  )
}
