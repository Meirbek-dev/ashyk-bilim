import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Role } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { roleName } from '../model/roles'
import { deleteRoleOptions } from '../queries'

/** The page's danger zone, last on the page: delete through the confirmation that names the role; then the list. */
export function DeleteRole({ role }: { role: Role }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const remove = useMutation(deleteRoleOptions(useQueryClient()))
  const confirm = () =>
    remove.mutate(
      { path: { slug: role.slug }, headers: { 'If-Match': role.version } },
      {
        onSuccess: async () => {
          setOpen(false)
          toast.add({ title: m.admin_role_deleted() })
          await navigate({ to: '/admin/roles' })
        },
      },
    )
  return (
    <section aria-labelledby="admin_role_delete_section" className="flex max-w-prose flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="admin_role_delete_section" className="text-xl font-semibold">
          {m.admin_role_delete_section()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.admin_role_delete_consequence()}</p>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) remove.reset()
        }}
        trigger={<Button variant="destructive">{m.admin_delete()}</Button>}
        title={m.admin_role_delete_title({ name: roleName(role) })}
        consequence={m.admin_role_delete_consequence()}
        confirmLabel={m.admin_delete()}
        onConfirm={confirm}
        pending={remove.isPending}
        error={remove.error}
      />
    </section>
  )
}
