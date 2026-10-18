import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AtRiskLearnerRow } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'
import { formatNumber } from '#/shared/i18n/format'

/**
 * Where to act on an at-risk learner: their works waiting for a grade in the inbox (B-ANL-29), and the course's learner
 * list found by name - email, progress, last activity (B-ANL-38).
 */
export function LearnerLinks({
  row,
}: {
  row: Pick<AtRiskLearnerRow, 'course_id' | 'user_display_name' | 'open_grading_blocks'>
}) {
  return (
    <>
      {row.open_grading_blocks > 0 ? (
        <RouterLink to="/teach" search={{ course: row.course_id }} className={buttonVariants({ variant: 'outline' })}>
          {m.analytics_grade_blocks({ count: formatNumber(row.open_grading_blocks) })}
        </RouterLink>
      ) : null}
      <RouterLink
        to="/teach/courses/$courseId/learners"
        params={{ courseId: row.course_id }}
        search={{ q: row.user_display_name }}
        className={buttonVariants({ variant: 'ghost' })}
      >
        {m.analytics_learner_in_course()}
      </RouterLink>
    </>
  )
}
