import { m } from '#/paraglide/messages'
import type { Collection, CollectionHit } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'
import { collectionVisibilityLabels } from '#/shared/i18n/labels'

/**
 * One collection on the shelf: its cover (else the picture of its first course that has one), its name set on the paper
 * (the whole card opens it), counts and description. A search hit has neither picture nor counts.
 */
export function CollectionItem({ collection }: { collection: Collection | CollectionHit }) {
  const full = 'courses' in collection ? collection : null
  return (
    <article className="relative flex h-full flex-col gap-3">
      <CourseCover imageKey={full?.cover_key ?? full?.courses.find(course => course.thumbnail_key)?.thumbnail_key} />
      <div className="flex flex-1 flex-col gap-1.5">
        <h2 className="font-heading text-lg/snug font-medium wrap-anywhere">
          <Link variant="stretched" to="/collections/$collectionId" params={{ collectionId: collection.id }}>
            {collection.name}
          </Link>
        </h2>
        {full ? (
          <p className="text-sm text-muted-foreground">
            {m.collections_course_count({ count: full.courses.length })}
            {' · '}
            {m.collections_updated({ date: formatDate(full.updated_at_unix) })}
          </p>
        ) : null}
        {collection.description ? (
          <p className="line-clamp-2 text-sm wrap-anywhere text-muted-foreground">{collection.description}</p>
        ) : null}
        {/* A guest sees only public ones; the badge marks the caller's own hidden collections (B-COL-05). */}
        {collection.public ? null : (
          <div className="pt-0.5">
            <StatusBadge tone="neutral">{collectionVisibilityLabels.private()}</StatusBadge>
          </div>
        )}
      </div>
    </article>
  )
}
