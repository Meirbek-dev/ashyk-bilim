import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { ActivityId, CourseId } from '#/shared/api/gen/types.gen'

import { taskOptions } from '../queries'
import { History } from './history'
import { TaskHeader } from './task-header'
import { WorkArea } from './work-area'

/** The task, the learner's work and the attempts; a task without a published config is "not set up yet" (B-FSB-02). */
export function TaskView({ courseId, activityId }: { courseId: CourseId; activityId: ActivityId }) {
  const { data: task } = useSuspenseQuery(taskOptions(activityId))
  // The deadline label compares with the time the page opened; what is refused comes from the server.
  const [now] = useState(() => Date.now() / 1000)
  if (!task)
    return (
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{m.submission_not_configured_title()}</h2>
        <p className="text-muted-foreground">{m.submission_not_configured_text()}</p>
      </div>
    )
  return (
    <>
      <TaskHeader task={task} now={now} />
      <WorkArea task={task} ids={{ courseId, activityId, taskId: task.id }} />
      <History taskId={task.id} />
    </>
  )
}
