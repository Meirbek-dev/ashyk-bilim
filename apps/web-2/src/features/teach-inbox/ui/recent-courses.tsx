import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'

import { recentCoursesOptions } from '../queries'

/**
 * The teacher's last-changed courses under the queue (B-INB-12): the course a teacher opens /teach for is usually one
 * of these, so it is one click away instead of two (the sidebar, then a list of fifty). The whole card opens its content;
 * work waiting for a grade is said on the card.
 */
export function RecentCourses() {
  const { data } = useSuspenseQuery(recentCoursesOptions())
  if (data.items.length === 0) return null
  return (
    <section aria-labelledby="inbox-courses" className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="inbox-courses" className="text-xl font-semibold">
          {m.inbox_courses_title()}
        </h2>
        <RouterLink
          to="/teach/courses"
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          {m.inbox_courses_all({ count: data.summary?.total ?? data.items.length })}
          <ArrowRight aria-hidden className="size-4" />
        </RouterLink>
      </div>
      <ul className="grid gap-x-6 gap-y-5 @xl:grid-cols-2 @xl:gap-y-8 @4xl:grid-cols-3">
        {data.items.map(course => (
          // Narrow, a row (a small picture beside the name): six full-width pictures were six screens of scrolling.
          // The anatomy of every course card (catalog, «Моё обучение»): the picture, the name under it, one meta line.
          <li key={course.id} className="group relative flex gap-4 @xl:flex-col @xl:gap-3">
            <CourseCover
              imageKey={course.thumbnail_key}
              className="w-28 shrink-0 self-start rounded-md border transition-opacity duration-150 group-hover:opacity-90 @xl:w-full @xl:rounded-lg"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 title={course.name} className="line-clamp-2 text-lg/snug font-semibold wrap-anywhere">
                <Link variant="stretched" to="/teach/courses/$courseId/content" params={{ courseId: course.id }}>
                  {course.name}
                </Link>
              </h3>
              {course.teaching ? (
                <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular-nums">
                  <span>{m.studio_list_learners({ count: course.teaching.learners })}</span>
                  {course.teaching.ungraded > 0 ? (
                    <span className="font-medium text-warning">
                      {m.studio_list_ungraded({ count: course.teaching.ungraded })}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
