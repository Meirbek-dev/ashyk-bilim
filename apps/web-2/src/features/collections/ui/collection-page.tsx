import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, Link as RouterLink } from '@tanstack/react-router'

import { CourseGrid } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import { CourseCover } from '#/shared/components/course-cover'
import { ListState } from '#/shared/components/list-state'
import { StatusBadge } from '#/shared/components/status-badge'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDate } from '#/shared/i18n/format'
import { collectionActionLabels, collectionVisibilityLabels } from '#/shared/i18n/labels'
import { buttonVariants } from '#/shared/components/button-variants'

import { can } from '../model/collections'
import { collectionOptions } from '../queries'
import { DeleteCollection } from './delete-collection'

/** One collection: what it is, its courses, and only the actions the API lists in `allowed_actions`. */
export function CollectionPage() {
  const { collectionId } = useParams({ from: '/_public/collections/$collectionId' })
  const query = useSuspenseQuery(collectionOptions(collectionId))
  const collection = query.data
  const actions = (
    <div className="flex flex-col gap-2 @2xl:flex-row">
      {can(collection, 'update') ? (
        <RouterLink to="/collections/$collectionId/edit" params={{ collectionId }} className={buttonVariants()}>
          {collectionActionLabels.update()}
        </RouterLink>
      ) : null}
      {can(collection, 'delete') ? <DeleteCollection collection={collection} /> : null}
    </div>
  )
  return (
    <DetailPage
      cover={
        <CourseCover
          seed={collection.id}
          imageKey={collection.cover_key}
          className="aspect-video w-full rounded-xl border"
        />
      }
      title={collection.name}
      meta={`${m.collections_course_count({ count: collection.courses.length })} · ${m.collections_updated({ date: formatDate(collection.updated_at_unix) })}`}
      // Public is the usual state (quiet, like the list); only a hidden one is marked (B-COL-05).
      status={
        collection.public ? undefined : <StatusBadge tone="neutral">{collectionVisibilityLabels.private()}</StatusBadge>
      }
      primaryAction={collection.allowed_actions.length > 0 ? actions : null}
    >
      {collection.description ? <p className="max-w-prose wrap-anywhere">{collection.description}</p> : null}
      <h2 className="text-xl font-semibold">{m.collections_courses_title()}</h2>
      <ListState
        pending={false}
        error={query.error}
        count={collection.courses.length}
        filtered={false}
        emptyText={m.collections_courses_empty()}
        // A new collection opens here empty: its author goes straight on to pick the courses.
        emptyAction={
          can(collection, 'update') ? (
            <RouterLink
              to="/collections/$collectionId/edit"
              params={{ collectionId }}
              className={buttonVariants({ variant: 'outline' })}
            >
              {m.collections_courses_add()}
            </RouterLink>
          ) : undefined
        }
        onRetry={() => void query.refetch()}
      >
        <CourseGrid courses={collection.courses} level={3} />
      </ListState>
    </DetailPage>
  )
}
