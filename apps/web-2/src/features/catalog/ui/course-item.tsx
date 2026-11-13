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
 * authors or progress there. The card has four lines: picture, name with authors, progress, then description and
 * marks. `CourseGrid` aligns the lines across a row; inside the last one the marks follow whatever stands above
 * them, so a course without a description has no hole between its authors and «С сертификатом».
 */
export function CourseItem({ course, level = 2 }: CourseItemProps) {
  const Heading = level === 2 ? 'h2' : 'h3'
  const state = courseState(course)
  const authors = authorNames(course.authors ?? [])
  const percent = course.progress ? Math.round(course.progress.progress_pct) : null
  return (
    <article className="relative row-span-4 grid grid-rows-subgrid">
      <CourseCover imageKey={course.thumbnail_key} className="row-start-1" />
      <div className="row-start-2 flex flex-col gap-1 pt-3">
        {/* Two lines at most: a 90-character name took five and pushed its neighbours' lines apart. */}
        <Heading title={course.name} className="line-clamp-2 font-heading text-lg/snug font-semibold wrap-anywhere">
          <Link variant="stretched" to="/courses/$courseId" params={{ courseId: course.id }}>
            {course.name}
          </Link>
        </Heading>
        {authors ? <p className="line-clamp-1 text-sm wrap-anywhere text-muted-foreground">{authors}</p> : null}
      </div>
      {percent === null ? null : (
        <div className="row-start-3 flex items-center gap-3 pt-2.5">
          <Progress aria-hidden value={percent} className="flex-1" />
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {m.catalog_course_progress({ percent: formatPercent(percent) })}
          </span>
        </div>
      )}
      <div className="row-start-4 flex flex-col">
        {course.description ? (
          <p className="line-clamp-2 pt-2 text-sm wrap-anywhere text-muted-foreground">{course.description}</p>
        ) : null}
        {state || course.certificate_offered ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 text-xs text-muted-foreground">
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
