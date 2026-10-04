import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { ErrorAlert } from '#/shared/components/error-alert'
import { IconButton } from '#/shared/components/icon-button'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { canGroup } from '../model/admin'
import { memberList, membersOptions, removeMembersOptions } from '../group-queries'
import { GroupMembersAdd } from './group-members-add'

/**
 * The members by keyset pages ("Show more"), linked to their profiles; with `manage_members` people are added by
 * search and removed one by one.
 */
export function GroupMembers({ group }: { group: Usergroup }) {
  const query = useSuspenseInfiniteQuery(membersOptions(group.id))
  const members = memberList(query.data.pages)
  const remove = useMutation(removeMembersOptions(useQueryClient()))
  const manage = canGroup(group, 'manage_members')
  return (
    <section aria-labelledby="group-members" className="flex flex-col gap-4">
      <h2 id="group-members" className="text-xl font-semibold">
        {m.admin_group_members()}
      </h2>
      {manage ? <GroupMembersAdd group={group} /> : null}
      {remove.error ? <ErrorAlert>{presentError(remove.error)}</ErrorAlert> : null}
      <ListState
        pending={false}
        error={query.error}
        count={members.length}
        filtered={false}
        emptyText={m.admin_group_members_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataList items={members} getKey={member => member.id}>
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
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </section>
  )
}
