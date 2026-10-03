import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { deleteGroupOptions } from '../queries'

/** Delete through the confirmation that names the group; then the list without it. */
export function DeleteGroup({ group }: { group: Usergroup }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const remove = useMutation(deleteGroupOptions())
  const confirm = () =>
    remove.mutate(
      { path: { group_id: group.id } },
      {
        onSuccess: async () => {
          setOpen(false)
          toast.add({ title: m.admin_group_deleted() })
          await navigate({ to: '/teach/groups' })
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
      trigger={<Button variant="outline">{m.admin_delete()}</Button>}
      title={m.admin_group_delete_title({ name: group.name })}
      consequence={m.admin_group_delete_consequence()}
      confirmLabel={m.admin_delete()}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
