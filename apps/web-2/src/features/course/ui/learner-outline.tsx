import { useSuspenseQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { CourseSearch, MyConcepts } from '#/features/concepts'
import { m } from '#/paraglide/messages'
import { Progress } from '#/shared/components/progress'
import type { Course } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'

import { certificateLine, nextActivity, outlineSyllabus } from '../model/course'
import { learnerStateOptions } from '../queries'
import { OutlineFacts } from './outline-facts'
import { Syllabus } from './syllabus'

type LearnerOutlineProps = {
  course: Course
  /** The course's description, if it has one. */
  description: ReactNode
  /** «Чему вы научитесь», if the course lists outcomes. */
  learnings: ReactNode
}

/**
 * A signed-in user's progress and syllabus, both straight from the learner state (spec 7.6: nothing is computed
 * here). Progress shows only to an enrolled learner, and only when there is something to count. The description and
 * the outcomes are read once, so someone taking the course finds them after the work (the description under its own
 * heading there), and a visitor (or a learner of a course with no work yet) before it.
 */
export function LearnerOutline({ course, description, learnings }: LearnerOutlineProps) {
  const { data: state, dataUpdatedAt } = useSuspenseQuery(learnerStateOptions(course.id))
  const { completed_required_count: done, total_required_count: total, progress_pct: percent } = state.progress
  const next = state.enrolled ? nextActivity(state) : null
  const certificate = certificateLine(state)
  const outline = outlineSyllabus(state, course.allowed_actions.includes('update'), Math.floor(dataUpdatedAt / 1000))
  // Nothing to take yet: «0 % / 0 из 0» counts nothing, and with no work to come first the description leads.
  const tracked = state.enrolled && (total > 0 || state.enrollment_state === 'completed')
  const aboutFirst = !state.enrolled || outline.length === 0
  const facts = next || certificate ? <OutlineFacts courseId={course.id} next={next} certificate={certificate} /> : null
  return (
    <>
      {aboutFirst ? (
        <>
          {description}
          {learnings}
        </>
      ) : null}
      {tracked ? (
        <section aria-labelledby="course-progress" className="flex flex-col gap-3">
          {/* One line: the number, what it counts, and at the bar's far end how much of it is done. The number is
              the hero title's size, not larger: the course's name stays the largest type on the page. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-3">
              <p aria-hidden className="font-heading text-3xl font-semibold tabular-nums">
                {formatPercent(Math.round(percent))}
              </p>
              <h2 id="course-progress" className="text-xl font-semibold">
                {state.enrollment_state === 'completed' ? m.course_completed_title() : m.course_progress_title()}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">{m.course_progress_count({ done, total })}</p>
          </div>
          <Progress value={percent} aria-labelledby="course-progress" className="progress-lg" />
          {facts}
        </section>
      ) : null}
      <Syllabus
        courseId={course.id}
        chapters={outline}
        note={tracked ? null : facts}
        open={!state.enrolled && state.guest_access && !course.allowed_actions.includes('update')}
      />
      {/* Where the learner stands per concept and what to review (docs/AI-FIRST.md 5), absent without
          concepts; then the search over the course material. */}
      {state.enrolled ? <MyConcepts courseId={course.id} /> : null}
      {state.enrolled && outline.length > 0 ? <CourseSearch courseId={course.id} /> : null}
      {aboutFirst ? null : (
        <>
          {description ? (
            <section aria-labelledby="course-about" className="flex flex-col gap-4">
              <h2 id="course-about" className="text-xl font-semibold">
                {m.platform_tab_about()}
              </h2>
              {description}
            </section>
          ) : null}
          {learnings}
        </>
      )}
    </>
  )
}
