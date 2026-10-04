import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { assessmentOptions, statsOptionsOf } from '../queries'
import { QueueView } from './queue-view'

/** The queue of a quiz, exam or code task: counts of the filtered group, publish-all and deadline extensions. */
export function AssessmentQueue({ activityId, courseId }: { activityId: string; courseId: string }) {
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activityId))
  const { group } = useSearch({ from: '/_authed/teach/courses/$courseId_/activities/$activityId/submissions' })
  const { data: stats } = useSuspenseQuery(statsOptionsOf(assessment.id, group))
  return (
    <QueueView
      work={{ kind: 'assessment', id: assessment.id }}
      courseId={courseId}
      stats={stats}
      canGrade={assessment.allowed_actions.includes('grade')}
    />
  )
}
