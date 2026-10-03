import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import type { ReactElement } from 'react'

import { workKind } from '../model/queue'
import { activityOptions } from '../queries'
import { AssessmentReview } from './assessment-review'
import { FileReview } from './file-review'
import type { ReviewAside } from './review-aside'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId'

/**
 * `submissions/$submissionId`: one work under review, a quiz / exam / code submission or a file attempt by the
 * activity's type (the loader answered "not found" for any other). `aside` is the AI analysis slot (slice 6.3).
 */
// The return type is spelled out: the route's own types refer back to this component (TS7023).
export function ReviewPage({ aside }: { aside?: ReviewAside }): ReactElement {
  const { courseId, activityId, submissionId } = useParams({ from: ROUTE })
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const at = { courseId, activityId, submissionId, aside }
  return workKind(activity.activity_type) === 'file' ? <FileReview {...at} /> : <AssessmentReview {...at} />
}
