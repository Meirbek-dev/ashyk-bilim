import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Usergroup, UsergroupMember } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { Link } from '#/shared/components/link'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { UserAvatar } from '#/shared/components/user-avatar'
import { toast } from '#/shared/ui/toast'

import { removeMembersOptions } from '../group-queries'

type GroupMemberRowProps = { group: Usergroup; member: UsergroupMember; manage: boolean }

/**
 * One member as a list row (avatar, name to the profile, @username); with `manage_members` «×» asks before removing:
 * a member leaves with the group's courses, so one stray click took a learner's access.
 */
export function GroupMemberRow({ group, member, manage }: GroupMemberRowProps) {
  const [confirming, setConfirming] = useState(false)
  const remove = useMutation(removeMembersOptions(useQueryClient()))
  const name = member.display_name || member.username
  return (
    <li className="flex min-h-row items-center gap-3 py-2">
      <UserAvatar name={name} avatarKey={member.avatar_key} />
      <p className="min-w-0 flex-1 wrap-anywhere">
        <Link to="/users/$username" params={{ username: member.username }}>
          {name}
        </Link>{' '}
        <span className="text-sm text-muted-foreground">@{member.username}</span>
      </p>
      {manage ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={next => {
            setConfirming(next)
            if (!next) remove.reset()
          }}
          trigger={<IconButton label={m.admin_group_member_remove({ name })} icon={<X aria-hidden />} />}
          title={m.admin_group_member_remove_title({ name, group: group.name })}
          consequence={m.admin_group_member_remove_consequence()}
          confirmLabel={m.admin_group_member_remove_confirm()}
          onConfirm={() =>
            remove.mutate(
              { group: group.id, members: [member] },
              {
                onSuccess: () => {
                  setConfirming(false)
                  toast.add({ title: m.admin_group_member_removed() })
                },
              },
            )
          }
          pending={remove.isPending}
          error={remove.error}
        />
      ) : null}
    </li>
  )
}
