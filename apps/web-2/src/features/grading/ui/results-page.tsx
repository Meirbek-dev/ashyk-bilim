import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

import { workKind } from '../model/queue'
import { activityOptions } from '../queries'
import { AssessmentResults } from './assessment-results'

/** The activity's `results` tab (B-GRD-18): the assessment's summary; a file submission has none yet. */
export function ResultsPage() {
  const { activityId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const kind = workKind(activity.activity_type)
  if (kind === 'assessment') return <AssessmentResults activityId={activityId} />
  return <p className="text-muted-foreground">{kind === 'file' ? m.grading_results_none() : m.grading_no_work()}</p>
}
