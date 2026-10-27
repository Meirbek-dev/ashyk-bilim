import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AdminUser, Usergroup, UsergroupMember } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { Link } from '#/shared/components/link'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'

import { removeMembersOptions } from '../group-queries'
import { userGroupsOptions } from '../queries'

/**
 * The groups the user is in (`?member=`), as links; «Убрать из группы» where the caller has `manage_members`, after a
 * confirmation (the user leaves with the group's courses).
 */
export function UserGroupList({ user, member }: { user: AdminUser; member: UsergroupMember }) {
  const { data: page } = useSuspenseQuery(userGroupsOptions(user.id))
  const remove = useMutation({
    ...removeMembersOptions(useQueryClient()),
    meta: { invalidates: [userGroupsOptions(user.id).queryKey] },
  })
  const [removing, setRemoving] = useState<Usergroup | null>(null)
  if (page.items.length === 0) return <p className="text-sm text-muted-foreground">{m.admin_user_groups_empty()}</p>
  return (
    <>
      <ul className="flex flex-col gap-1">
        {page.items.map(group => (
          <li key={group.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 wrap-anywhere">
              <Link to="/teach/groups/$groupId" params={{ groupId: group.id }}>
                {group.name}
              </Link>
            </span>
            {group.allowed_actions.includes('manage_members') ? (
              <IconButton
                label={m.admin_user_group_remove({ group: group.name })}
                icon={<X aria-hidden />}
                onClick={() => setRemoving(group)}
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
          remove.reset()
        }}
        title={m.admin_group_member_remove_title({
          name: user.display_name || user.username,
          group: removing?.name ?? '',
        })}
        consequence={m.admin_group_member_remove_consequence()}
        confirmLabel={m.admin_group_member_remove_confirm()}
        onConfirm={() => {
          if (!removing) return
          remove.mutate(
            { group: removing.id, members: [member] },
            {
              onSuccess: () => {
                setRemoving(null)
                toast.add({ title: m.admin_user_group_removed() })
              },
            },
          )
        }}
        pending={remove.isPending}
        error={remove.error}
      />
    </>
  )
}
