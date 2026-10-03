import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Usergroup, UserHit } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'
import { DataList } from '#/shared/ui/data-list'
import { IconButton } from '#/shared/ui/icon-button'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'
import { Skeleton } from '#/shared/ui/skeleton'

import { canGroup } from '../model/admin'
import { addMembersOptions, membersOptions, removeMembersOptions } from '../queries'
import { PeoplePicker } from './people-picker'

/** The members, linked to their profiles; with `manage_members` people are added by search and removed one by one. */
export function GroupMembers({ group }: { group: Usergroup }) {
  const members = useSuspenseQuery(membersOptions(group.id))
  const queryClient = useQueryClient()
  const add = useMutation(addMembersOptions(queryClient))
  const remove = useMutation(removeMembersOptions(queryClient))
  const [picked, setPicked] = useState<UserHit[]>([])
  const manage = canGroup(group, 'manage_members')
  const submit = () =>
    add.mutate(
      { group: group.id, members: picked },
      {
        onSuccess: () => {
          setPicked([])
          toast(m.admin_group_members_added())
        },
      },
    )
  const error = add.error ?? remove.error
  return (
    <section aria-labelledby="group-members" className="flex flex-col gap-4">
      <h2 id="group-members" className="text-xl font-semibold">
        {m.admin_group_members()}
      </h2>
      {manage ? (
        <form
          noValidate
          className="flex max-w-prose flex-col items-start gap-2"
          onSubmit={event => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="w-full">
            <Suspense fallback={<Skeleton shape="row" />}>
              <PeoplePicker label={m.admin_group_members_add()} value={picked} onValueChange={setPicked} />
            </Suspense>
          </div>
          <Button type="submit" variant="outline" pending={add.isPending} disabled={picked.length === 0}>
            {m.admin_add()}
          </Button>
        </form>
      ) : null}
      {error ? <Alert>{presentError(error)}</Alert> : null}
      <ListState
        pending={false}
        error={members.error}
        count={members.data.length}
        filtered={false}
        emptyText={m.admin_group_members_empty()}
        onRetry={() => void members.refetch()}
      >
        <DataList items={members.data} getKey={member => member.id}>
          {member => (
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 wrap-anywhere">
                <Link to="/users/$username" params={{ username: member.username }}>
                  {member.display_name || member.username}
                </Link>{' '}
                <span className="text-sm text-muted-foreground">@{member.username}</span>
              </p>
              {manage ? (
                <IconButton
                  label={m.admin_group_member_remove({ name: member.display_name || member.username })}
                  icon={<X aria-hidden />}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(
                      { group: group.id, members: [member] },
                      { onSuccess: () => toast(m.admin_group_member_removed()) },
                    )
                  }
                />
              ) : null}
            </div>
          )}
        </DataList>
      </ListState>
    </section>
  )
}
