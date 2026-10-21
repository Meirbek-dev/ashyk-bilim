import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AtRiskLearnerRow } from '#/shared/api/gen/types.gen'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/components/button-variants'
import { formatNumber } from '#/shared/i18n/format'

/**
 * Where to act on an at-risk learner: an email to them - «Связаться» is the usual recommendation (B-ANL-42), their works
 * waiting for a grade in the inbox (B-ANL-29), and the course's learner list found by username (B-ANL-38).
 */
export function LearnerLinks({
  row,
}: {
  row: Pick<
    AtRiskLearnerRow,
    'course_id' | 'user_display_name' | 'user_username' | 'user_email' | 'open_grading_blocks'
  >
}) {
  return (
    <>
      {row.user_email ? (
        <Anchor href={`mailto:${row.user_email}`} className={buttonVariants({ variant: 'outline' })}>
          {m.analytics_write_email()}
        </Anchor>
      ) : null}
      {row.open_grading_blocks > 0 ? (
        <RouterLink to="/teach" search={{ course: row.course_id }} className={buttonVariants({ variant: 'outline' })}>
          {m.analytics_grade_blocks({ count: formatNumber(row.open_grading_blocks) })}
        </RouterLink>
      ) : null}
      <RouterLink
        to="/teach/courses/$courseId/learners"
        params={{ courseId: row.course_id }}
        search={{ q: row.user_username || row.user_display_name }}
        className={buttonVariants({ variant: 'ghost' })}
      >
        {m.analytics_learner_in_course()}
      </RouterLink>
    </>
  )
}
