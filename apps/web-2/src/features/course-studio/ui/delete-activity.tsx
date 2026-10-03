import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Activity } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'

import { deleteActivityOptions } from '../curriculum-queries'

/** Delete an activity through the confirmation that names it; sent with `If-Match: version`. */
export function DeleteActivity({ courseId, activity }: { courseId: string; activity: Activity }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteActivityOptions(useQueryClient(), courseId))
  const confirm = () =>
    remove.mutate(
      { path: { activity_id: activity.id }, headers: { 'If-Match': activity.version } },
      {
        onSuccess: () => {
          setOpen(false)
          toast.add({ title: m.studio_deleted() })
        },
      },
    )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) remove.reset()
      }}
      trigger={<IconButton label={m.studio_delete_named({ name: activity.name })} icon={<Trash2 aria-hidden />} />}
      title={m.studio_activity_delete_title({ name: activity.name })}
      consequence={m.studio_activity_delete_consequence()}
      confirmLabel={m.studio_delete()}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
