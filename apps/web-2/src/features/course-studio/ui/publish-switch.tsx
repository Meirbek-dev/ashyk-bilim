import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Switch } from '#/shared/ui/switch'
import { toast } from '#/shared/ui/toast'

import { updateActivityOptions } from '../curriculum-queries'

type PublishSwitchProps = { courseId: string; activity: ActivityDetail }

/** What a media lesson still needs before it goes live (409 `activity-media-missing`), by its kind. */
const missingMedia: Record<string, () => string> = {
  video_hosted: m.studio_publish_needs_video,
  video_youtube: m.studio_publish_needs_link,
  document_pdf: m.studio_publish_needs_document,
  document_doc: m.studio_publish_needs_document,
}

const refusal = (error: unknown, activity: ActivityDetail) =>
  error instanceof ApiError && error.code === 'activity-media-missing'
    ? (missingMedia[activity.activity_sub_type] ?? (() => presentError(error)))()
    : presentError(error)

/**
 * Draft / published in the studio header (spec 5.4). Publishing acts at once; unpublishing asks first, because
 * learners lose the activity (UX-200). A refusal (an assessment not ready, a lesson without its file or link) is
 * shown next to the switch.
 */
export function PublishSwitch({ courseId, activity }: PublishSwitchProps) {
  const labelId = useId()
  const [confirming, setConfirming] = useState(false)
  const update = useMutation(updateActivityOptions(useQueryClient(), courseId))
  const editable = activity.allowed_actions.includes('update')
  const set = (published: boolean) =>
    update.mutate(
      { path: { activity_id: activity.id }, body: { published }, headers: { 'If-Match': activity.version } },
      {
        onSuccess: () => {
          setConfirming(false)
          toast.add({ title: published ? m.studio_activity_published() : m.studio_activity_unpublished() })
        },
      },
    )
  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm">
        {m.studio_published_switch()}
      </span>
      <Switch
        aria-labelledby={labelId}
        checked={activity.published}
        disabled={!editable || update.isPending}
        onCheckedChange={next => (next ? set(true) : setConfirming(true))}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={next => {
          setConfirming(next)
          if (!next) update.reset()
        }}
        title={m.studio_activity_unpublish_title({ name: activity.name })}
        consequence={m.studio_activity_unpublish_consequence()}
        confirmLabel={m.studio_unpublish()}
        onConfirm={() => set(false)}
        pending={update.isPending}
        error={update.error}
      />
      {update.error && !confirming ? (
        <span role="alert" className="max-w-64 text-sm text-destructive">
          {refusal(update.error, activity)}
        </span>
      ) : null}
    </div>
  )
}
