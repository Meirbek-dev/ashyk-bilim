import { m } from '#/paraglide/messages'
import type { Collection, CollectionHit } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'
import { collectionVisibilityLabels } from '#/shared/i18n/labels'

/**
 * One collection on the shelf: its cover (else the picture of its first course that has one), its name set on the paper
 * (the whole card opens it), counts and description. A search hit has neither picture nor counts. Four lines
 * (picture, name with counts, description, mark) that `CollectionGrid` aligns across a row, as the catalog's shelf does.
 */
export function CollectionItem({ collection }: { collection: Collection | CollectionHit }) {
  const full = 'courses' in collection ? collection : null
  return (
    <article className="relative row-span-4 grid grid-rows-subgrid">
      <CourseCover
        imageKey={full?.cover_key ?? full?.courses.find(course => course.thumbnail_key)?.thumbnail_key}
        className="row-start-1"
      />
      <div className="row-start-2 flex flex-col gap-1 pt-3">
        <h2 title={collection.name} className="line-clamp-2 font-heading text-lg/snug font-semibold wrap-anywhere">
          <Link variant="stretched" to="/collections/$collectionId" params={{ collectionId: collection.id }}>
            {collection.name}
          </Link>
        </h2>
        {full ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {m.collections_course_count({ count: full.courses.length })}
            {' · '}
            {m.collections_updated({ date: formatDate(full.updated_at_unix) })}
          </p>
        ) : null}
      </div>
      {collection.description ? (
        <p className="row-start-3 line-clamp-2 pt-2 text-sm wrap-anywhere text-muted-foreground">
          {collection.description}
        </p>
      ) : null}
      {/* A guest sees only public ones; the badge marks the caller's own hidden collections (B-COL-05). */}
      {collection.public ? null : (
        <div className="row-start-4 pt-2.5">
          <StatusBadge tone="neutral">{collectionVisibilityLabels.private()}</StatusBadge>
        </div>
      )}
    </article>
  )
}
