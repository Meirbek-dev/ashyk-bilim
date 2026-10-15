import { m } from '#/paraglide/messages'
import type { TeacherSubmission } from '#/shared/api/gen/types.gen'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'

import { orderedViolations, violationKind } from '../model/violations'
import { violationLabels } from './labels'

/**
 * The exam guard's record (B-GRD-29): how many violations counted and each event with its time, so the grader sees an
 * attempt handed in by the threshold or a suspicious one. Nothing when the attempt has none.
 */
export function ViolationsSection({
  submission,
}: {
  submission: Pick<TeacherSubmission, 'violations' | 'violation_count'>
}) {
  if (submission.violation_count === 0 && submission.violations.length === 0) return null
  return (
    <section aria-labelledby="grading-violations" className="flex flex-col gap-2">
      <h2 id="grading-violations" className="text-xl font-semibold">
        {m.grading_violations_title()}
      </h2>
      <p>{m.grading_violations_count({ count: formatNumber(submission.violation_count) })}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {orderedViolations(submission.violations).map((event, index) => {
          const kind = violationKind(event.kind)
          return (
            <li key={`${event.at}-${index}`} className="flex flex-wrap gap-x-3">
              <span className="text-muted-foreground tabular-nums">{formatDateTime(event.at)}</span>
              <span>{kind ? violationLabels[kind]() : event.kind}</span>
              {event.detail ? <span className="wrap-anywhere text-muted-foreground">{event.detail}</span> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
