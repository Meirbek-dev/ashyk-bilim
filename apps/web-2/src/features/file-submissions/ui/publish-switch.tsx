import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Switch } from '#/shared/ui/switch'
import { toast } from '#/shared/ui/toast'

import { publishTaskOptions, taskOptions, unpublishTaskOptions } from '../queries'

const needsInstructions = (error: unknown) =>
  error instanceof ApiError && error.fieldErrors.some(field => field.field === 'instructions')

/**
 * "Published" in the studio header for a file submission: the task is what goes live (the server flips the activity
 * with it), so the switch publishes and unpublishes the task, like "Publish task" on the page (B-FSB-13, B-FSB-21).
 * The activity alone cannot be published before its task (409 `activity-not-ready`).
 */
function TaskPublishSwitch({ activity }: { activity: ActivityDetail }) {
  const labelId = useId()
  const queryClient = useQueryClient()
  const { data: task } = useSuspenseQuery(taskOptions(activity.id))
  const publish = useMutation(publishTaskOptions(queryClient, activity.course_id, activity.id))
  const unpublish = useMutation(unpublishTaskOptions(queryClient, activity.course_id, activity.id))
  const [confirming, setConfirming] = useState(false)
  if (!task) return null
  const published = task.lifecycle === 'published'
  const allowed = (task.allowed_actions ?? []).includes(published ? 'unpublish' : 'publish')
  const pending = publish.isPending || unpublish.isPending
  const run = () =>
    publish.mutate(
      { path: { file_submission_id: task.id } },
      { onSuccess: () => toast.add({ title: m.submission_published_toast() }) },
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Text only when wide, as the header's back and preview links: a phone keeps its room for the title. */}
      <span id={labelId} className="sr-only text-sm @md:not-sr-only">
        {m.studio_published_switch()}
      </span>
      <Switch
        aria-labelledby={labelId}
        checked={published}
        disabled={!allowed || pending}
        onCheckedChange={next => (next ? run() : setConfirming(true))}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={next => {
          setConfirming(next)
          if (!next) unpublish.reset()
        }}
        title={m.submission_unpublish_title()}
        consequence={m.submission_unpublish_consequence()}
        confirmLabel={m.submission_unpublish()}
        onConfirm={() =>
          unpublish.mutate(
            { path: { file_submission_id: task.id } },
            {
              onSuccess: () => {
                setConfirming(false)
                toast.add({ title: m.submission_unpublished_toast() })
              },
            },
          )
        }
        pending={unpublish.isPending}
        error={unpublish.error}
      />
      {publish.error ? (
        <span role="alert" className="max-w-64 text-sm text-destructive">
          {needsInstructions(publish.error) ? m.submission_publish_needs_instructions() : presentError(publish.error)}
        </span>
      ) : null}
    </div>
  )
}

/** The studio header's published control (course-studio `publishControl`): file submissions only, null for the rest. */
export const fileSubmissionPublishControl = (activity: ActivityDetail) =>
  activity.activity_type === 'file_submission' ? <TaskPublishSwitch activity={activity} /> : null
