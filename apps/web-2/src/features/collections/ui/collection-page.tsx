import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { formatDate } from '#/shared/i18n/format'
import { collectionActionLabels, collectionVisibility, collectionVisibilityLabels } from '#/shared/i18n/labels'
import { Badge } from '#/shared/ui/badge'
import { DataList } from '#/shared/ui/data-list'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'
import { DetailPage } from '#/shared/ui/templates/detail-page'

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
        <Link to="/collections/$collectionId/edit" params={{ collectionId }} variant="primary">
          {collectionActionLabels.update()}
        </Link>
      ) : null}
      {can(collection, 'delete') ? <DeleteCollection collection={collection} /> : null}
    </div>
  )
  return (
    <DetailPage
      title={collection.name}
      meta={`${m.collections_course_count({ count: collection.courses.length })} · ${m.collections_updated({ date: formatDate(collection.updated_at_unix) })}`}
      status={<Badge tone="neutral">{collectionVisibilityLabels[collectionVisibility(collection)]()}</Badge>}
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
        onRetry={() => void query.refetch()}
      >
        <DataList items={collection.courses} getKey={course => course.id}>
          {course => (
            <>
              <h3 className="font-medium wrap-anywhere">
                <Link to="/courses/$courseId" params={{ courseId: course.id }}>
                  {course.name}
                </Link>
              </h3>
              {course.description ? <p className="text-sm text-muted-foreground">{course.description}</p> : null}
            </>
          )}
        </DataList>
      </ListState>
    </DetailPage>
  )
}
