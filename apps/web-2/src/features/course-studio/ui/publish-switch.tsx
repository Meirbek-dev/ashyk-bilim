import { Switch } from '@base-ui/react/switch'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { updateActivityOptions } from '../curriculum-queries'

// The kit's SwitchField look, outside a form: the studio header holds no form.
const switchClass =
  'inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-input bg-background transition-colors duration-150 data-checked:border-primary data-checked:bg-primary'
const thumbClass =
  'size-3.5 translate-x-0.5 rounded-full bg-input transition-transform duration-150 data-checked:translate-x-4.5 data-checked:bg-primary-foreground'

type PublishSwitchProps = { courseId: string; activity: ActivityDetail }

/**
 * Draft / published in the studio header (spec 5.4). Publishing acts at once; unpublishing asks first, because
 * learners lose the activity (UX-200). A refusal (an assessment not ready) is shown next to the switch.
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
          toast(published ? m.studio_activity_published() : m.studio_activity_unpublished())
        },
      },
    )
  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm">
        {m.studio_published_switch()}
      </span>
      <Switch.Root
        aria-labelledby={labelId}
        checked={activity.published}
        disabled={!editable || update.isPending}
        onCheckedChange={next => (next ? set(true) : setConfirming(true))}
        className={switchClass}
      >
        <Switch.Thumb className={thumbClass} />
      </Switch.Root>
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
        <span role="alert" className="max-w-48 text-sm text-destructive">
          {presentError(update.error)}
        </span>
      ) : null}
    </div>
  )
}
