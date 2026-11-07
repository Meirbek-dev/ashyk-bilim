import { Award } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { Course, CourseListItem } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { Progress } from '#/shared/components/progress'
import { formatPercent } from '#/shared/i18n/format'

import { authorNames, courseState, type CourseState } from '../model/catalog'

const stateLabels = {
  unpublished: m.catalog_course_state_unpublished,
  archived: m.catalog_course_state_archived,
} satisfies Record<CourseState, () => string>

type CourseItemProps = { course: Course & Partial<Pick<CourseListItem, 'authors' | 'progress'>>; level?: 2 | 3 }

/**
 * One course on the shelf: its picture, then its name set on the paper (the whole card opens the course), authors, the
 * signed-in learner's progress, one or two lines of description, unusual states. Search hits are plain `Course`s: no
 * authors or progress there.
 */
export function CourseItem({ course, level = 2 }: CourseItemProps) {
  const Heading = level === 2 ? 'h2' : 'h3'
  const state = courseState(course)
  const authors = authorNames(course.authors ?? [])
  const percent = course.progress ? Math.round(course.progress.progress_pct) : null
  return (
    <article className="relative flex h-full flex-col gap-3">
      <CourseCover imageKey={course.thumbnail_key} />
      <div className="flex flex-1 flex-col gap-1.5">
        <Heading className="font-heading text-lg/snug font-medium wrap-anywhere">
          <Link variant="stretched" to="/courses/$courseId" params={{ courseId: course.id }}>
            {course.name}
          </Link>
        </Heading>
        {authors ? <p className="line-clamp-1 text-sm wrap-anywhere text-muted-foreground">{authors}</p> : null}
        {percent === null ? null : (
          <div className="flex items-center gap-3 py-1">
            <Progress aria-hidden value={percent} className="flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {m.catalog_course_progress({ percent: formatPercent(percent) })}
            </span>
          </div>
        )}
        {course.description ? (
          <p className="line-clamp-2 text-sm wrap-anywhere text-muted-foreground">{course.description}</p>
        ) : null}
        {state || course.certificate_offered ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
            {state ? <span className="font-medium text-foreground">{stateLabels[state]()}</span> : null}
            {course.certificate_offered ? (
              <span className="flex items-center gap-1">
                <Award aria-hidden className="size-3.5" />
                {m.catalog_course_certificate()}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </article>
  )
}
