import { m } from '#/paraglide/messages'
import type { Course, CourseListItem } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { Progress } from '#/shared/components/progress'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'

import { authorNames, courseState, type CourseState } from '../model/catalog'

const stateLabels = {
  unpublished: m.catalog_course_state_unpublished,
  archived: m.catalog_course_state_archived,
} satisfies Record<CourseState, () => string>

type CourseItemProps = { course: Course & Partial<Pick<CourseListItem, 'authors' | 'progress'>>; level?: 2 | 3 }

/**
 * One course card: its cover (thumbnail or ornament), name (the whole card opens the course), description, authors,
 * the signed-in learner's progress, date, and a badge for unusual states. Search hits are plain `Course`s: no
 * authors or progress there.
 */
export function CourseItem({ course, level = 2 }: CourseItemProps) {
  const Heading = level === 2 ? 'h2' : 'h3'
  const state = courseState(course)
  const authors = authorNames(course.authors ?? [])
  const percent = course.progress ? Math.round(course.progress.progress_pct) : null
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs transition-colors hover:border-input">
      <CourseCover seed={course.id} imageKey={course.thumbnail_key} className="aspect-3/1 w-full @xl:aspect-2/1" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="min-w-0 text-lg font-semibold wrap-anywhere">
            <Link variant="stretched" to="/courses/$courseId" params={{ courseId: course.id }}>
              {course.name}
            </Link>
          </Heading>
          {state ? <StatusBadge tone="neutral">{stateLabels[state]()}</StatusBadge> : null}
        </div>
        {course.description ? (
          <p className="line-clamp-2 text-sm wrap-anywhere text-muted-foreground">{course.description}</p>
        ) : null}
        {authors ? (
          <p className="line-clamp-1 text-sm wrap-anywhere">{m.catalog_course_authors({ names: authors })}</p>
        ) : null}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          {percent === null ? null : (
            <div className="flex items-center gap-3">
              <Progress aria-hidden value={percent} className="flex-1" />
              <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                {m.catalog_course_progress({ percent })}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {m.catalog_course_updated({ date: formatDate(course.updated_at_unix) })}
          </p>
        </div>
      </div>
    </article>
  )
}
