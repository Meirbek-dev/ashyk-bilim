import { useSuspenseQuery } from '@tanstack/react-query'

import type { CourseId, UserId } from '#/shared/api/gen/types.gen'

import { pageCount } from '../model/analytics'
import type { Filters } from '../model/filters'
import { learnerRiskOptions } from '../queries'
import { LearnerSheet } from './learner-sheet'

type LearnerLookupProps = { learnerId: UserId; courseId: CourseId; filters: Filters; page?: number }

/** The loader warms these pages; the queries keep risk details current after interventions. */
export function LearnerLookup({ page = 1, ...props }: LearnerLookupProps) {
  const { data } = useSuspenseQuery(learnerRiskOptions(props.filters, props.courseId, page))
  const row = data.items.find(item => item.user_id === props.learnerId && item.course_id === props.courseId)
  if (!row && data.items.length > 0 && page < pageCount(data.total, data.page_size))
    return <LearnerLookup {...props} page={page + 1} />
  return <LearnerSheet learnerId={props.learnerId} courseId={props.courseId} row={row} />
}
