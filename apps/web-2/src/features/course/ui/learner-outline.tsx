import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { Progress } from '#/shared/components/progress'
import type { Course } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'

import { outlineSyllabus } from '../model/course'
import { learnerStateOptions } from '../queries'
import { LeaveCourse } from './leave-course'
import { Syllabus } from './syllabus'

/**
 * A signed-in user's progress and syllabus, both straight from the learner state (spec 7.6: nothing is computed
 * here). Progress and "Leave" show only to an enrolled learner.
 */
export function LearnerOutline({ course }: { course: Course }) {
  const { data: state } = useSuspenseQuery(learnerStateOptions(course.id))
  const { completed_required_count: done, total_required_count: total, progress_pct: percent } = state.progress
  return (
    <>
      {state.enrolled ? (
        <section aria-labelledby="course-progress" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-4">
              <p aria-hidden className="font-heading text-display font-semibold tabular-nums">
                {formatPercent(Math.round(percent))}
              </p>
              <div className="flex flex-col">
                <h2 id="course-progress" className="text-xl font-semibold">
                  {m.course_progress_title()}
                </h2>
                <p className="text-sm text-muted-foreground tabular-nums">{m.course_progress_count({ done, total })}</p>
              </div>
            </div>
            <LeaveCourse course={course} />
          </div>
          <Progress value={percent} aria-labelledby="course-progress" className="progress-lg" />
        </section>
      ) : null}
      <Syllabus courseId={course.id} chapters={outlineSyllabus(state)} />
    </>
  )
}
