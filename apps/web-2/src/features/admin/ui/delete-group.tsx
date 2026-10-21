import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { deleteGroupOptions } from '../group-queries'

/** The page's danger zone, last on the page: delete through the confirmation that names the group; then the list. */
export function DeleteGroup({ group }: { group: Usergroup }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const remove = useMutation(deleteGroupOptions())
  const confirm = () =>
    remove.mutate(
      { path: { group_id: group.id }, headers: { 'If-Match': group.version } },
      {
        onSuccess: async () => {
          setOpen(false)
          toast.add({ title: m.admin_group_deleted() })
          await navigate({ to: '/teach/groups' })
        },
      },
    )
  return (
    <section aria-labelledby="admin_group_delete_section" className="flex max-w-prose flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="admin_group_delete_section" className="text-xl font-semibold">
          {m.admin_group_delete_section()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.admin_group_delete_consequence()}</p>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) remove.reset()
        }}
        trigger={<Button variant="destructive">{m.admin_delete()}</Button>}
        title={m.admin_group_delete_title({ name: group.name })}
        consequence={m.admin_group_delete_consequence()}
        confirmLabel={m.admin_delete()}
        onConfirm={confirm}
        pending={remove.isPending}
        error={remove.error}
      />
    </section>
  )
}
