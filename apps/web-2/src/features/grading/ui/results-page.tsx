import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { EmptyState } from '#/shared/components/empty-state'

import { workKind } from '../model/queue'
import { activityOptions } from '../queries'
import { AssessmentResults } from './assessment-results'
import { FileResults } from './file-results'

/** The activity's `results` tab (B-GRD-18): the assessment's summary, a file submission's counts. */
export function ResultsPage() {
  const { activityId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const kind = workKind(activity.kind)
  if (kind === 'assessment') return <AssessmentResults activityId={activityId} />
  if (kind === 'file') return <FileResults activityId={activityId} />
  return (
    <div className="max-w-6xl">
      <EmptyState>{m.grading_no_work()}</EmptyState>
    </div>
  )
}
