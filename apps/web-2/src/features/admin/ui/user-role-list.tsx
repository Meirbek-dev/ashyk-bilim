import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AdminUser } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { StatusBadge } from '#/shared/components/status-badge'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'

import { unassignRoleOptions } from '../queries'

type RoleListProps = { user: AdminUser; manage: boolean; nameOf: (slug: string) => string }

/** The role badges; with `manage_roles` each has «×», which asks before the role goes. */
export function RoleList({ user, manage, nameOf }: RoleListProps) {
  const unassign = useMutation(unassignRoleOptions(useQueryClient()))
  const [removing, setRemoving] = useState<string | null>(null)
  const remove = (slug: string) =>
    unassign.mutate(
      { path: { user_id: user.id, slug } },
      {
        onSuccess: () => {
          setRemoving(null)
          toast.add({ title: m.admin_user_role_removed() })
        },
      },
    )
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {user.roles.map(slug => (
          <li key={slug} className="flex items-center gap-1">
            <StatusBadge tone="neutral">{nameOf(slug)}</StatusBadge>
            {manage ? (
              <IconButton
                label={m.admin_user_role_remove({ role: nameOf(slug) })}
                icon={<X aria-hidden />}
                onClick={() => setRemoving(slug)}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={next => {
          if (next) return
          setRemoving(null)
          unassign.reset()
        }}
        title={m.admin_user_role_remove_title({
          role: nameOf(removing ?? ''),
          name: user.display_name || user.username,
        })}
        consequence={m.admin_user_role_remove_consequence()}
        confirmLabel={m.admin_user_role_remove_confirm()}
        onConfirm={() => {
          if (removing) remove(removing)
        }}
        pending={unassign.isPending}
        error={unassign.error}
      />
    </>
  )
}
