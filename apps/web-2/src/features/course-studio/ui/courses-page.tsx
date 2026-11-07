import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'

import { hasNoCourses, presetCount } from '../model/course'
import { myCoursesOptions } from '../queries'
import { CoursesPresets } from './courses-presets'
import { CoursesSearchBox } from './courses-search'
import { CoursesSortMenu } from './courses-sort'
import { CourseListItem } from './course-list-item'
import { CoursesBulkBar } from './courses-bulk-bar'
import { CreateCourseDialog } from './create-course-dialog'

/** `/teach/courses`: the caller's editable courses, filtered by name and preset (both in the URL). */
export function CoursesPage() {
  const { create: opened, ...search } = useSearch({ from: '/_authed/teach/courses/' })
  const navigate = useNavigate()
  const { data: session } = useSuspenseQuery(sessionOptions())
  const query = useSuspenseInfiniteQuery(myCoursesOptions(search))
  const courses = query.data.pages.flatMap(page => page.items)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const summary = query.data.pages[0]?.summary
  // No course at all (not a filter that matches none): no search, order or presets to offer - only the empty state.
  const none = summary !== undefined && hasNoCourses(summary) && !search.q
  return (
    <ListPage
      title={m.studio_courses_title()}
      count={summary && !none ? m.studio_courses_count({ count: presetCount(summary, search.preset) }) : undefined}
      primaryAction={
        hasCapability(session, 'course.create') ? <CreateCourseDialog initiallyOpen={opened === true} /> : null
      }
      search={
        // The presets are the list's sections, so they stay in sight on a phone (as tabs, not behind a «Filters» sheet):
        // wide, one row on one rule with the search and the order.
        none ? undefined : (
          <div className="flex w-full flex-col gap-3 @4xl:flex-row @4xl:items-end @4xl:justify-between @4xl:gap-6 @4xl:border-b">
            <CoursesPresets search={search} summary={summary} />
            <div className="flex flex-wrap items-end gap-2 @4xl:mb-2 @4xl:flex-nowrap">
              {/* Keyed by the URL value: "back" to another search refills the box. */}
              <CoursesSearchBox key={search.q ?? ''} search={search} />
              <CoursesSortMenu search={search} />
            </div>
          </div>
        )
      }
    >
      <ListState
        pending={false}
        error={query.error}
        count={courses.length}
        filtered={Boolean(search.q ?? search.preset)}
        emptyText={
          summary && summary.total === 0 && summary.archived > 0
            ? m.studio_courses_all_archived()
            : m.studio_courses_empty()
        }
        onResetFilters={() => void navigate({ to: '/teach/courses', search: {} })}
        onRetry={() => void query.refetch()}
      >
        <CoursesBulkBar
          selected={courses.filter(course => selected.has(course.id))}
          onDone={() => setSelected(new Set())}
        />
        {/* The filter row's rule is the table's top on a wide screen. */}
        <div className="@4xl:-mt-gutter @4xl:[&>ul]:border-t-0">
          <DataList items={courses} getKey={course => course.id} variant="rows">
            {course => (
              <CourseListItem course={course} checked={selected.has(course.id)} onToggle={() => toggle(course.id)} />
            )}
          </DataList>
        </div>
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </ListPage>
  )
}
