import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'

import { presetCount, type Preset } from '../model/course'
import { myCoursesOptions } from '../queries'
import { CoursesSearchBox } from './courses-search'
import { CoursesSortMenu } from './courses-sort'
import { CourseListItem } from './course-list-item'
import { CoursesBulkBar } from './courses-bulk-bar'
import { CreateCourseDialog } from './create-course-dialog'

const presetLabels: Record<Preset | 'all', () => string> = {
  all: m.studio_preset_all,
  drafts: m.studio_preset_drafts,
  published: m.studio_preset_published,
  archived: m.studio_preset_archived,
}
const PRESETS = ['all', 'drafts', 'published', 'archived'] as const

/** `/teach/courses`: the caller's editable courses, filtered by name and preset (both in the URL). */
export function CoursesPage() {
  const search = useSearch({ from: '/_authed/teach/courses/' })
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
  const filters = (
    <nav aria-label={m.studio_preset_label()} className="flex flex-wrap">
      {PRESETS.map(preset => {
        const value = preset === 'all' ? undefined : preset
        return (
          <Link
            key={preset}
            to="/teach/courses"
            search={{ q: search.q, preset: value, sort: search.sort }}
            activeOptions={{ exact: true }}
            variant="tab"
          >
            {presetLabels[preset]()}
            {summary ? (
              <span className="ms-2 text-muted-foreground tabular-nums">{presetCount(summary, value)}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
  return (
    <ListPage
      title={m.studio_courses_title()}
      count={summary ? m.studio_courses_count({ count: presetCount(summary, search.preset) }) : undefined}
      primaryAction={hasCapability(session, 'course.create') ? <CreateCourseDialog /> : null}
      // Keyed by the URL value: "back" to another search refills the box.
      search={
        // One row with the presets: a wrapper of its own put the order menu on a second line under the search box.
        <>
          <CoursesSearchBox key={search.q ?? ''} search={search} />
          <CoursesSortMenu search={search} />
        </>
      }
      filters={filters}
      activeFilters={search.preset ? 1 : 0}
    >
      <ListState
        pending={false}
        error={query.error}
        count={courses.length}
        filtered={Boolean(search.q ?? search.preset)}
        emptyText={m.studio_courses_empty()}
        onResetFilters={() => void navigate({ to: '/teach/courses', search: {} })}
        onRetry={() => void query.refetch()}
      >
        <CoursesBulkBar
          selected={courses.filter(course => selected.has(course.id))}
          onDone={() => setSelected(new Set())}
        />
        <DataList items={courses} getKey={course => course.id} variant="rows">
          {course => (
            <CourseListItem course={course} checked={selected.has(course.id)} onToggle={() => toggle(course.id)} />
          )}
        </DataList>
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </ListPage>
  )
}
