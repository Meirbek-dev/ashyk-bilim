import type { SearchResults } from '#/shared/api/gen/types.gen'
import { Avatar } from '#/shared/ui/avatar'
import { DataList } from '#/shared/ui/data-list'
import { Link } from '#/shared/ui/link'

import type { SearchKind } from '../model/catalog'
import { CourseItem } from './course-item'
import { searchKindLabels } from './kind-labels'

/** One section of the search answer: its heading and its hits, each a link to the object's page. */
export function SearchSection({ kind, results }: { kind: SearchKind; results: SearchResults }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{searchKindLabels[kind]()}</h2>
      {kind === 'courses' ? (
        <DataList items={results.courses} getKey={course => course.id}>
          {course => <CourseItem course={course} level={3} />}
        </DataList>
      ) : null}
      {kind === 'collections' ? (
        <DataList items={results.collections} getKey={collection => collection.id}>
          {collection => (
            <>
              <h3 className="text-lg font-medium wrap-anywhere">
                <Link to="/collections/$collectionId" params={{ collectionId: collection.id }}>
                  {collection.name}
                </Link>
              </h3>
              {collection.description ? <p className="line-clamp-3 wrap-anywhere">{collection.description}</p> : null}
            </>
          )}
        </DataList>
      ) : null}
      {kind === 'users' ? (
        <DataList items={results.users} getKey={user => user.id}>
          {user => (
            <div className="flex items-center gap-3">
              <Avatar name={user.display_name} />
              <div className="flex min-w-0 flex-col">
                <h3 className="font-medium wrap-anywhere">
                  <Link to="/users/$username" params={{ username: user.username }}>
                    {user.display_name}
                  </Link>
                </h3>
                <p className="text-sm wrap-anywhere text-muted-foreground">{`@${user.username}`}</p>
              </div>
            </div>
          )}
        </DataList>
      ) : null}
    </section>
  )
}
