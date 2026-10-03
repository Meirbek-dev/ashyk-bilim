import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { Progress } from '#/shared/ui/progress'
import type { Course } from '#/shared/api/gen/types.gen'

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
        <section aria-labelledby="course-progress" className="flex flex-col gap-2">
          <h2 id="course-progress" className="text-xl font-semibold">
            {m.course_progress_title()}
          </h2>
          <Progress value={percent} aria-labelledby="course-progress" className="max-w-prose" />
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-muted-foreground tabular-nums">{m.course_progress_count({ done, total })}</p>
            <LeaveCourse course={course} />
          </div>
        </section>
      ) : null}
      <Syllabus courseId={course.id} chapters={outlineSyllabus(state)} />
    </>
  )
}
