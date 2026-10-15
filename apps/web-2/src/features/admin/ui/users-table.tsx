import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AdminUser } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'

import { usersListOptions, type UsersFilter } from '../queries'
import { userStatusBadges } from './labels'
import { RoleNames } from './role-names'

const columns = (namedRoles: boolean): DataColumn<AdminUser>[] => [
  {
    id: 'user',
    header: m.admin_users_col_user(),
    priority: 1,
    // The panel opens from the URL (R-07): this link is the shareable address of the user.
    cell: user => (
      <span className="flex flex-col wrap-anywhere">
        <Link from="/admin/users" to="/admin/users" search={prev => ({ ...prev, user: user.id })}>
          {user.display_name || user.username}
        </Link>
        <span className="wrap-anywhere text-muted-foreground">@{user.username}</span>
      </span>
    ),
  },
  { id: 'email', header: m.admin_users_col_email(), priority: 2, cell: user => user.email },
  {
    id: 'roles',
    header: m.admin_users_col_roles(),
    priority: 2,
    cell: user => (namedRoles ? <RoleNames slugs={user.roles} /> : user.roles.join(', ')),
  },
  {
    id: 'status',
    header: m.admin_users_col_status(),
    priority: 2,
    cell: user => {
      const badge = userStatusBadges[user.status]
      return <StatusBadge tone={badge.tone}>{badge.label()}</StatusBadge>
    },
  },
  {
    id: 'created',
    header: m.admin_users_col_created(),
    priority: 3,
    cell: user => <span className="tabular-nums">{formatDate(user.created_at_unix)}</span>,
  },
]

/** The directory in the URL's order, "Show more" by keyset cursor; a search or filter with no hits offers to reset. */
export function UsersTable({ filter, namedRoles }: { filter: UsersFilter; namedRoles: boolean }) {
  const query = useSuspenseInfiniteQuery(usersListOptions(filter))
  const navigate = useNavigate()
  const users = query.data.pages.flatMap(page => page.items)
  return (
    <ListState
      pending={false}
      error={query.error}
      count={users.length}
      filtered={Boolean(filter.q ?? filter.status ?? filter.role)}
      emptyText={m.admin_users_empty()}
      onResetFilters={() => void navigate({ to: '/admin/users', search: {} })}
      onRetry={() => void query.refetch()}
    >
      <DataTable label={m.admin_users_table()} rows={users} columns={columns(namedRoles)} getKey={user => user.id} />
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
