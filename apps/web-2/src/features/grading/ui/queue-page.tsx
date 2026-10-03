import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

import { workKind } from '../model/queue'
import { activityOptions } from '../queries'
import { AssessmentQueue } from './assessment-queue'
import { FileQueue } from './file-queue'

/** The activity's `submissions` tab: the queue of what was handed in, or one sentence when nothing is (B-GRD-01). */
export function QueuePage() {
  const { activityId, courseId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const kind = workKind(activity.activity_type)
  if (kind === 'assessment') return <AssessmentQueue activityId={activityId} courseId={courseId} />
  if (kind === 'file') return <FileQueue activityId={activityId} />
  return <p className="text-muted-foreground">{m.grading_no_work()}</p>
}
