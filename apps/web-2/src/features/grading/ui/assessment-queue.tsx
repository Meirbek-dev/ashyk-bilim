import { useSuspenseQuery } from '@tanstack/react-query'

import { assessmentOptions, statsOptionsOf } from '../queries'
import { QueueView } from './queue-view'

/** The queue of a quiz, exam or code task: with the server's counts, publish-all and deadline extensions. */
export function AssessmentQueue({ activityId, courseId }: { activityId: string; courseId: string }) {
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activityId))
  const { data: stats } = useSuspenseQuery(statsOptionsOf(assessment.id))
  return (
    <QueueView
      work={{ kind: 'assessment', id: assessment.id }}
      courseId={courseId}
      stats={stats}
      canGrade={assessment.allowed_actions.includes('grade')}
    />
  )
}
