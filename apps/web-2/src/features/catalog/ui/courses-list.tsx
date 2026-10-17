import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import type { CoursesFilter } from '../model/catalog'
import { coursesListOptions } from '../queries'
import { CourseGrid } from './course-grid'

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
      <CourseGrid courses={courses} />
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
