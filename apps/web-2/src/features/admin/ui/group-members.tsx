import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Suspense, useState, type FormEvent } from 'react'

import { m } from '#/paraglide/messages'
import type { Usergroup, UserHit } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { ErrorAlert } from '#/shared/components/error-alert'
import { IconButton } from '#/shared/components/icon-button'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Skeleton } from '#/shared/ui/skeleton'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

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
  const submit = (event: FormEvent) => {
    event.preventDefault()
    add.mutate(
      { group: group.id, members: picked },
      {
        onSuccess: () => {
          setPicked([])
          toast.add({ title: m.admin_group_members_added() })
        },
      },
    )
  }
  const error = add.error ?? remove.error
  return (
    <section aria-labelledby="group-members" className="flex flex-col gap-4">
      <h2 id="group-members" className="text-xl font-semibold">
        {m.admin_group_members()}
      </h2>
      {manage ? (
        <form noValidate className="flex max-w-prose flex-col items-start gap-2" onSubmit={submit}>
          <div className="w-full">
            <Suspense fallback={<Skeleton className="h-row w-full" />}>
              <PeoplePicker label={m.admin_group_members_add()} value={picked} onValueChange={setPicked} />
            </Suspense>
          </div>
          <Button type="submit" variant="outline" disabled={picked.length === 0 || add.isPending}>
            {add.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.admin_add()}
          </Button>
        </form>
      ) : null}
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
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
                      { onSuccess: () => toast.add({ title: m.admin_group_member_removed() }) },
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
