import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { canGroup } from '../model/admin'
import { memberList, membersOptions } from '../group-queries'
import { GroupMemberRow } from './group-member-row'
import { GroupMembersAdd } from './group-members-add'

/**
 * The members by keyset pages ("Show more") as a compact list (it was a card per person), linked to their profiles;
 * with `manage_members` people are added by search and removed one by one, after a confirmation.
 */
export function GroupMembers({ group }: { group: Usergroup }) {
  const query = useSuspenseInfiniteQuery(membersOptions(group.id))
  const members = memberList(query.data.pages)
  const manage = canGroup(group, 'manage_members')
  return (
    <section aria-labelledby="group-members" className="flex flex-col gap-4">
      <h2 id="group-members" className="text-xl font-semibold">
        {m.admin_group_members()}
      </h2>
      {manage ? <GroupMembersAdd group={group} /> : null}
      <ListState
        pending={false}
        error={query.error}
        count={members.length}
        filtered={false}
        emptyText={m.admin_group_members_empty()}
        onRetry={() => void query.refetch()}
      >
        <ul className="flex flex-col divide-y border-y">
          {members.map(member => (
            <GroupMemberRow key={member.id} group={group} member={member} manage={manage} />
          ))}
        </ul>
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </section>
  )
}
