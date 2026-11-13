import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { EmptyState } from '#/shared/components/empty-state'

import { workKind } from '../model/queue'
import { activityOptions } from '../queries'
import { AssessmentQueue } from './assessment-queue'
import { FileQueue } from './file-queue'

/** The activity's `submissions` tab: the queue of what was handed in, or one sentence when nothing is (B-GRD-01). */
export function QueuePage() {
  const { activityId, courseId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const kind = workKind(activity.activity_type)
  // The workspace is as wide as the window; a row read across 1900 px loses its learner before it reaches the grade.
  if (kind === 'assessment')
    return (
      <div className="max-w-6xl">
        <AssessmentQueue activityId={activityId} courseId={courseId} />
      </div>
    )
  if (kind === 'file')
    return (
      <div className="max-w-6xl">
        <FileQueue activityId={activityId} />
      </div>
    )
  return (
    <div className="max-w-6xl">
      <EmptyState>{m.grading_no_work()}</EmptyState>
    </div>
  )
}
