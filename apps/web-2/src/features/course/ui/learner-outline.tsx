import { useSuspenseQuery } from '@tanstack/react-query'
import { Award } from 'lucide-react'
import type { ReactNode } from 'react'

import { CourseSearch, MyConcepts } from '#/features/concepts'
import { m } from '#/paraglide/messages'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { Link } from '#/shared/components/link'
import { Progress } from '#/shared/components/progress'
import type { Course } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'
import { activityType } from '#/shared/i18n/labels'

import { certificateLine, nextActivity, outlineSyllabus, type NextReason } from '../model/course'
import { learnerStateOptions } from '../queries'
import { LeaveCourse } from './leave-course'
import { Syllabus } from './syllabus'

// Why «Далее» is not simply the next activity in order: an overdue exam put first must not look like a skipped course.
const nextReasons = {
  overdue: { label: m.course_next_reason_overdue, className: 'text-warning' },
  due_soon: { label: m.course_next_reason_due_soon, className: 'text-warning' },
  returned_for_revision: { label: m.course_next_reason_returned, className: 'text-warning' },
  in_progress: { label: m.course_next_reason_in_progress, className: 'text-muted-foreground' },
} satisfies Record<NextReason, { label: () => string; className: string }>

/**
 * A signed-in user's progress and syllabus, both straight from the learner state (spec 7.6: nothing is computed
 * here). Progress and "Leave" (at the end, after the programme) show only to an enrolled learner, progress only when
 * there is something to count. `about` is the course's description: read once, so someone taking the course finds it
 * after the work, and a visitor (or a learner of a course with no work yet) before it.
 */
export function LearnerOutline({ course, about }: { course: Course; about: ReactNode }) {
  const { data: state, dataUpdatedAt } = useSuspenseQuery(learnerStateOptions(course.id))
  const { completed_required_count: done, total_required_count: total, progress_pct: percent } = state.progress
  const next = state.enrolled ? nextActivity(state) : null
  const certificate = certificateLine(state)
  const outline = outlineSyllabus(state, course.allowed_actions.includes('update'), Math.floor(dataUpdatedAt / 1000))
  // Nothing to take yet: «0 % / 0 из 0» counts nothing, and with no work to come first the description leads.
  const tracked = total > 0 || state.enrollment_state === 'completed'
  const aboutFirst = !state.enrolled || outline.length === 0
  const nextLine = next ? (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{m.course_next_up()}</span>
      <ActivityIcon type={activityType(next.type)} size="sm" />
      <Link to="/learn/$courseId/$activityId" params={{ courseId: course.id, activityId: next.id }}>
        {next.title}
      </Link>
      {next.reason ? (
        <span className={nextReasons[next.reason].className}>· {nextReasons[next.reason].label()}</span>
      ) : null}
    </p>
  ) : null
  return (
    <>
      {aboutFirst ? about : null}
      {state.enrolled && tracked ? (
        <section aria-labelledby="course-progress" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-4">
              <p aria-hidden className="font-heading text-display font-semibold tabular-nums">
                {formatPercent(Math.round(percent))}
              </p>
              <div className="flex flex-col">
                <h2 id="course-progress" className="text-xl font-semibold">
                  {state.enrollment_state === 'completed' ? m.course_completed_title() : m.course_progress_title()}
                </h2>
                <p className="text-sm text-muted-foreground tabular-nums">{m.course_progress_count({ done, total })}</p>
              </div>
            </div>
          </div>
          <Progress value={percent} aria-labelledby="course-progress" className="progress-lg" />
          {nextLine}
        </section>
      ) : (
        nextLine
      )}
      {/* What finishing earns (B-CRS-20): the certificate is a reason to start and to finish. */}
      {certificate ? (
        <p className="flex items-center gap-2 text-sm">
          <Award aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {certificate.kind === 'yours' ? (
            <Link to="/certificates/$certificateId/verify" params={{ certificateId: certificate.code }}>
              {m.course_certificate_yours()}
            </Link>
          ) : (
            m.course_certificate_offered()
          )}
        </p>
      ) : null}
      <Syllabus courseId={course.id} chapters={outline} />
      {/* Where the learner stands per concept and what to review (docs/AI-FIRST.md 5), absent without
          concepts; then the search over the course material. */}
      {state.enrolled ? <MyConcepts courseId={course.id} /> : null}
      {state.enrolled && outline.length > 0 ? <CourseSearch courseId={course.id} /> : null}
      {aboutFirst ? null : about}
      {/* Rare and destructive: after the programme, not between the progress and its bar (on a phone it split them).
          An archived course is read-only: the server refuses to let anyone leave it (409). */}
      {state.enrolled && !course.archived_at_unix ? (
        <div className="flex justify-end border-t pt-4">
          <LeaveCourse course={course} />
        </div>
      ) : null}
    </>
  )
}
