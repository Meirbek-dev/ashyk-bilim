import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'

import { groupsListOptions } from '../queries'
import { CreateGroupDialog } from './create-group-dialog'

const columns: DataColumn<Usergroup>[] = [
  {
    id: 'name',
    header: m.admin_field_name(),
    priority: 1,
    cell: group => (
      <span className="wrap-anywhere">
        <Link to="/teach/groups/$groupId" params={{ groupId: group.id }}>
          {group.name}
        </Link>
      </span>
    ),
  },
  {
    id: 'description',
    header: m.admin_field_description(),
    priority: 2,
    cell: group => <span className="wrap-anywhere">{group.description}</span>,
  },
  {
    id: 'members',
    header: m.admin_group_members(),
    priority: 2,
    cell: group => <span className="tabular-nums">{group.member_count}</span>,
  },
]

/** User groups, newest first, "Show more" by keyset cursor; a group's members and edits live on its page. */
export function GroupsPage() {
  const query = useSuspenseInfiniteQuery(groupsListOptions())
  const groups = query.data.pages.flatMap(page => page.items)
  return (
    <ListPage title={m.admin_groups_title()} primaryAction={<CreateGroupDialog />}>
      <ListState
        pending={false}
        error={query.error}
        count={groups.length}
        filtered={false}
        emptyText={m.admin_groups_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataTable label={m.admin_groups_table()} rows={groups} columns={columns} getKey={group => group.id} />
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </ListPage>
  )
}
