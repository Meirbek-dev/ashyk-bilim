import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { formatDate } from '#/shared/i18n/format'
import { DataList } from '#/shared/ui/data-list'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'
import { ShowMore } from '#/shared/ui/show-more'
import { ListPage } from '#/shared/ui/templates/list-page'

import { courseStatus, presetCount, type Preset } from '../model/course'
import { myCoursesOptions } from '../queries'
import { CourseStatusBadge } from './course-status'
import { CoursesSearchBox } from './courses-search'
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
  const summary = query.data.pages[0]?.summary
  const filters = (
    <nav aria-label={m.studio_preset_label()} className="flex flex-wrap">
      {PRESETS.map(preset => {
        const value = preset === 'all' ? undefined : preset
        return (
          <Link
            key={preset}
            to="/teach/courses"
            search={{ q: search.q, preset: value }}
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
      search={<CoursesSearchBox key={search.q ?? ''} search={search} />}
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
        <DataList items={courses} getKey={course => course.id}>
          {course => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 text-lg font-medium wrap-anywhere">
                  <Link to="/teach/courses/$courseId/overview" params={{ courseId: course.id }}>
                    {course.name}
                  </Link>
                </h2>
                <CourseStatusBadge status={courseStatus(course)} />
              </div>
              <p className="text-sm text-muted-foreground">
                {m.studio_updated({ date: formatDate(course.updated_at_unix) })}
              </p>
            </>
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
