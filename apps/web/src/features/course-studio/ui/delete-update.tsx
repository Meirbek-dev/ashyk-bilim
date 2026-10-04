import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseUpdate } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { deleteUpdateOptions } from '../queries'

/** Delete an announcement through the confirmation that names it. */
export function DeleteUpdate({ courseId, update }: { courseId: string; update: CourseUpdate }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteUpdateOptions(useQueryClient(), courseId))
  const confirm = () =>
    remove.mutate(
      { path: { update_id: update.id } },
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
      trigger={<Button variant="outline">{m.studio_delete()}</Button>}
      title={m.studio_update_delete_title({ title: update.title })}
      consequence={m.studio_update_delete_consequence()}
      confirmLabel={m.studio_delete()}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
