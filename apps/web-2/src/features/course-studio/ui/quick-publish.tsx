import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Activity } from '#/shared/api/gen/types.gen'
import { SubmitButton } from '#/shared/components/submit-button'
import { toast } from '#/shared/ui/toast'

import { updateActivityOptions } from '../curriculum-queries'
import { LESSON_TYPES } from '../model/curriculum'
import { refusal } from './publish-switch'

/**
 * «Опубликовать» on a draft lesson's row in `content` (UX-F-2): no trip into the studio for each lesson. A lesson
 * without its video, link or document is refused next to the button, worded as in the studio's switch.
 */
type QuickPublishProps = {
  courseId: string
  activity: Activity
  /** Where focus goes once the button is gone (the row is live): the row's next control. */
  onPublished?: () => void
}

export function QuickPublish({ courseId, activity, onPublished }: QuickPublishProps) {
  const update = useMutation(updateActivityOptions(useQueryClient(), courseId))
  if (activity.published || !LESSON_TYPES.includes(activity.activity_type)) return null
  if (!activity.allowed_actions.includes('update')) return null
  const publish = () =>
    update.mutate(
      { path: { activity_id: activity.id }, body: { published: true }, headers: { 'If-Match': activity.version } },
      {
        onSuccess: () => {
          toast.add({ title: m.studio_activity_published() })
          onPublished?.()
        },
      },
    )
  return (
    <>
      {update.error ? (
        <span role="alert" className="text-sm text-destructive">
          {refusal(update.error, activity)}
        </span>
      ) : null}
      <SubmitButton
        variant="outline"
        aria-label={m.studio_publish_named({ name: activity.name })}
        pending={update.isPending}
        onClick={publish}
      >
        {m.studio_publish()}
      </SubmitButton>
    </>
  )
}
