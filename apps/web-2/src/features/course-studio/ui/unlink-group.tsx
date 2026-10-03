import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { unlinkGroupOptions } from '../queries'

/** Unlink a group through the confirmation that names it; the list drops it at once. */
export function UnlinkGroup({ courseId, group }: { courseId: string; group: Usergroup }) {
  const [open, setOpen] = useState(false)
  const unlink = useMutation(unlinkGroupOptions(useQueryClient(), courseId))
  const confirm = () =>
    unlink.mutate(group, {
      onSuccess: () => {
        setOpen(false)
        toast(m.studio_group_unlinked())
      },
    })
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) unlink.reset()
      }}
      trigger={<Button variant="outline">{m.studio_group_unlink()}</Button>}
      title={m.studio_group_unlink_title({ name: group.name })}
      consequence={m.studio_group_unlink_consequence()}
      confirmLabel={m.studio_group_unlink()}
      onConfirm={confirm}
      pending={unlink.isPending}
      error={unlink.error}
    />
  )
}
