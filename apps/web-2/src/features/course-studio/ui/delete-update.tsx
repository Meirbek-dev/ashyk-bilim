import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { CourseUpdate } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { deleteUpdateOptions } from '../queries'

/** Delete an announcement through the confirmation that names it. */
export function DeleteUpdate({ courseId, update }: { courseId: string; update: CourseUpdate }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteUpdateOptions(useQueryClient(), courseId))
  const confirm = () =>
    remove.mutate(
      { path: { id: update.id } },
      {
        onSuccess: () => {
          setOpen(false)
          toast(m.studio_deleted())
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
