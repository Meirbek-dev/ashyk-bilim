import { useSuspenseQuery } from '@tanstack/react-query'
import { Award } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { Link } from '#/shared/components/link'
import { Progress } from '#/shared/components/progress'
import type { Course } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'
import { activityType } from '#/shared/i18n/labels'

import { certificateLine, nextActivity, outlineSyllabus } from '../model/course'
import { learnerStateOptions } from '../queries'
import { LeaveCourse } from './leave-course'
import { Syllabus } from './syllabus'

/**
 * A signed-in user's progress and syllabus, both straight from the learner state (spec 7.6: nothing is computed
 * here). Progress and "Leave" (at the end, after the programme) show only to an enrolled learner.
 */
export function LearnerOutline({ course }: { course: Course }) {
  const { data: state } = useSuspenseQuery(learnerStateOptions(course.id))
  const { completed_required_count: done, total_required_count: total, progress_pct: percent } = state.progress
  const next = state.enrolled ? nextActivity(state) : null
  const certificate = certificateLine(state)
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
                  {state.enrollment_state === 'completed' ? m.course_completed_title() : m.course_progress_title()}
                </h2>
                <p className="text-sm text-muted-foreground tabular-nums">{m.course_progress_count({ done, total })}</p>
              </div>
            </div>
          </div>
          <Progress value={percent} aria-labelledby="course-progress" className="progress-lg" />
          {next ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{m.course_next_up()}</span>
              <ActivityIcon type={activityType(next.type)} size="sm" />
              <Link to="/learn/$courseId/$activityId" params={{ courseId: course.id, activityId: next.id }}>
                {next.title}
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}
      {/* What finishing earns (B-CRS-20): the certificate is a reason to start and to finish. */}
      {certificate ? (
        <p className="flex items-center gap-2 text-sm">
          <Award aria-hidden className="size-4 shrink-0 text-reward" />
          {certificate.kind === 'yours' ? (
            <Link to="/certificates/$certificateId/verify" params={{ certificateId: certificate.code }}>
              {m.course_certificate_yours()}
            </Link>
          ) : (
            m.course_certificate_offered()
          )}
        </p>
      ) : null}
      <Syllabus courseId={course.id} chapters={outlineSyllabus(state, course.allowed_actions.includes('update'))} />
      {/* Rare and destructive: after the programme, not between the progress and its bar (on a phone it split them). */}
      {state.enrolled ? (
        <div className="flex justify-end border-t pt-4">
          <LeaveCourse course={course} />
        </div>
      ) : null}
    </>
  )
}
