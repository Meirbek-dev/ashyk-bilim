import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AdminUser, UsergroupMember } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { IconButton } from '#/shared/components/icon-button'
import { Link } from '#/shared/components/link'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { removeMembersOptions } from '../group-queries'
import { userGroupsOptions } from '../queries'

/** The groups the user is in (`?member=`), as links; «Убрать из группы» where the caller has `manage_members`. */
export function UserGroupList({ user, member }: { user: AdminUser; member: UsergroupMember }) {
  const { data: page } = useSuspenseQuery(userGroupsOptions(user.id))
  const remove = useMutation({
    ...removeMembersOptions(useQueryClient()),
    meta: { invalidates: [userGroupsOptions(user.id).queryKey] },
  })
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
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { group: group.id, members: [member] },
                    { onSuccess: () => toast.add({ title: m.admin_user_group_removed() }) },
                  )
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
      {remove.error ? <ErrorAlert>{presentError(remove.error)}</ErrorAlert> : null}
    </>
  )
}
