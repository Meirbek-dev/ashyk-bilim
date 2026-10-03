import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { taskOptions } from '../queries'
import { QueueView } from './queue-view'

/** The queue of a file submission: no counts, no publish-all, no extensions (SPEC: waits for the server). */
export function FileQueue({ activityId }: { activityId: string }) {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const { data: task } = useSuspenseQuery(taskOptions(activityId))
  return <QueueView work={{ kind: 'file', id: task.id }} courseId={courseId} stats={null} canGrade={false} />
}
