import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'

import { fileStatsOptions, taskOptions } from '../queries'
import { QueueView } from './queue-view'

/** The queue of a file submission: counts of the filtered group, publish-all and extensions (B-GRD-25). */
export function FileQueue({ activityId }: { activityId: string }) {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const { group } = useSearch({ from: '/_authed/teach/courses/$courseId_/activities/$activityId/submissions' })
  const { data: task } = useSuspenseQuery(taskOptions(activityId))
  const { data: stats } = useSuspenseQuery(fileStatsOptions(task.id, group))
  return <QueueView work={{ kind: 'file', id: task.id }} courseId={courseId} stats={stats} canGrade />
}
