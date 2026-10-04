import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ActivityId } from '#/shared/api/gen/types.gen'

import { taskOptions } from '../queries'
import { DeadlinesSection } from './deadlines-section'
import { FilesSection } from './files-section'
import { InstructionsSection } from './instructions-section'
import { PublishSection } from './publish-section'
import { RubricSection } from './rubric-section'

type TaskStudioProps = { activityId: ActivityId; tab: 'edit' | 'settings' }

/**
 * A file-submission task in the activity studio: `edit` holds its state, instructions and rubric (B-FSB-13..15),
 * `settings` its file rules, deadline and attempts (B-FSB-16, B-FSB-17). Each section saves on its own.
 */
export function TaskStudio({ activityId, tab }: TaskStudioProps) {
  const { data: task } = useSuspenseQuery(taskOptions(activityId))
  // An activity retyped without a config row (an interrupted create): nothing to configure, nothing to create it with.
  if (!task) return <p className="max-w-prose text-muted-foreground">{m.submission_missing_config()}</p>
  return (
    <div key={task.id} className="flex flex-col gap-12">
      {tab === 'edit' ? (
        <>
          <PublishSection task={task} />
          <InstructionsSection task={task} />
          <RubricSection task={task} />
        </>
      ) : (
        <>
          <FilesSection task={task} />
          <DeadlinesSection task={task} />
        </>
      )}
    </div>
  )
}
