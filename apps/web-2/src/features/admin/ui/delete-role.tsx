import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Role } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { roleName } from '../model/roles'
import { deleteRoleOptions } from '../queries'

/** Delete through the confirmation that names the role; then the list without it. */
export function DeleteRole({ role }: { role: Role }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const remove = useMutation(deleteRoleOptions(useQueryClient()))
  const confirm = () =>
    remove.mutate(
      { path: { slug: role.slug } },
      {
        onSuccess: async () => {
          setOpen(false)
          toast(m.admin_role_deleted())
          await navigate({ to: '/admin/roles' })
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
      title={m.admin_role_delete_title({ name: roleName(role) })}
      consequence={m.admin_role_delete_consequence()}
      confirmLabel={m.admin_delete()}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
