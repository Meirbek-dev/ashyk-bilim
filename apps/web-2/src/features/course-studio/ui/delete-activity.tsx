import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Activity } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'

import { deleteActivityOptions, learnerWorkRefusal, updateActivityOptions } from '../curriculum-queries'

/**
 * Delete an activity through the confirmation that names it; sent with `If-Match: version`. One that learners handed
 * work in is never deleted (no `delete` in `allowed_actions`, or a 409 from a stale view): the dialog offers to hide
 * (unpublish) it instead, or says that it already is.
 */
export function DeleteActivity({ courseId, activity }: { courseId: string; activity: Activity }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const remove = useMutation(deleteActivityOptions(queryClient, courseId))
  const hide = useMutation(updateActivityOptions(queryClient, courseId))
  const locked = !activity.allowed_actions.includes('delete') || learnerWorkRefusal(remove.error)
  const done = (title: string) => {
    setOpen(false)
    toast.add({ title })
  }
  const request = { path: { activity_id: activity.id }, headers: { 'If-Match': activity.version } }
  const confirm = () =>
    locked
      ? hide.mutate(
          { ...request, body: { published: false } },
          { onSuccess: () => done(m.studio_activity_unpublished()) },
        )
      : remove.mutate(request, { onSuccess: () => done(m.studio_deleted()) })
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) {
          remove.reset()
          hide.reset()
        }
      }}
      trigger={<IconButton label={m.studio_delete_named({ name: activity.name })} icon={<Trash2 aria-hidden />} />}
      title={
        locked
          ? m.studio_activity_locked_title({ name: activity.name })
          : m.studio_activity_delete_title({ name: activity.name })
      }
      consequence={
        !locked
          ? m.studio_activity_delete_consequence()
          : activity.published
            ? m.studio_activity_locked_consequence()
            : m.studio_activity_locked_hidden()
      }
      confirmLabel={locked ? m.studio_hide() : m.studio_delete()}
      onConfirm={locked && !activity.published ? undefined : confirm}
      pending={remove.isPending || hide.isPending}
      error={locked ? hide.error : remove.error}
    />
  )
}
