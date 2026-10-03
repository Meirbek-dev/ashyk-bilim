import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/ui/data-list'
import { ListState } from '#/shared/ui/list-state'
import { ShowMore } from '#/shared/ui/show-more'

import type { CoursesFilter } from '../model/catalog'
import { coursesListOptions } from '../queries'
import { CourseItem } from './course-item'

/** The catalog in the requested order, "Show more" by keyset cursor (spec 5.6). The sort is not a filter. */
export function CoursesList({ filter }: { filter: CoursesFilter }) {
  const query = useSuspenseInfiniteQuery(coursesListOptions(filter))
  const navigate = useNavigate({ from: '/courses/' })
  const courses = query.data.pages.flatMap(page => page.items)
  return (
    <ListState
      pending={false}
      error={query.error}
      count={courses.length}
      filtered={filter.q !== undefined}
      emptyText={m.catalog_courses_empty()}
      onResetFilters={() => void navigate({ search: prev => ({ ...prev, q: undefined }) })}
      onRetry={() => void query.refetch()}
    >
      <DataList items={courses} getKey={course => course.id}>
        {course => <CourseItem course={course} />}
      </DataList>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
