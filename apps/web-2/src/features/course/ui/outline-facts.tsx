import { Award } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { Link } from '#/shared/components/link'
import { activityType } from '#/shared/i18n/labels'

import { type certificateLine, type nextActivity, type NextReason } from '../model/course'

// Why «Далее» is not simply the next activity in order: an overdue exam put first must not look like a skipped course.
const nextReasons = {
  overdue: { label: m.course_next_reason_overdue, className: 'text-warning' },
  due_soon: { label: m.course_next_reason_due_soon, className: 'text-warning' },
  returned_for_revision: { label: m.course_next_reason_returned, className: 'text-warning' },
  in_progress: { label: m.course_next_reason_in_progress, className: 'text-muted-foreground' },
} satisfies Record<NextReason, { label: () => string; className: string }>

type OutlineFactsProps = {
  courseId: CourseId
  next: ReturnType<typeof nextActivity>
  certificate: ReturnType<typeof certificateLine>
}

/**
 * What comes next and what finishing earns (B-CRS-20: the certificate is a reason to start and to finish): two short
 * lines under the progress bar, or in the programme's head when there is no bar.
 */
export function OutlineFacts({ courseId, next, certificate }: OutlineFactsProps) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {next ? (
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{m.course_next_up()}</span>
          <ActivityIcon type={activityType(next.type)} size="sm" />
          <Link to="/learn/$courseId/$activityId" params={{ courseId, activityId: next.id }}>
            {next.title}
          </Link>
          {next.reason ? (
            <span className={nextReasons[next.reason].className}>· {nextReasons[next.reason].label()}</span>
          ) : null}
        </p>
      ) : null}
      {certificate ? (
        <p className="flex items-center gap-2">
          <span className="grid size-5 shrink-0 place-items-center">
            <Award aria-hidden className="size-4 text-muted-foreground" />
          </span>
          {certificate.kind === 'yours' ? (
            <Link to="/certificates/$certificateId/verify" params={{ certificateId: certificate.code }}>
              {m.course_certificate_yours()}
            </Link>
          ) : (
            m.course_certificate_offered()
          )}
        </p>
      ) : null}
    </div>
  )
}
