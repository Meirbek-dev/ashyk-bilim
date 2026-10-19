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
import { UserAvatar } from '#/shared/components/user-avatar'
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
      <span className="flex items-center gap-3">
        <UserAvatar name={user.display_name || user.username} avatarKey={user.avatar_key} />
        <span className="flex min-w-0 flex-col">
          <Link variant="title" from="/admin/users" to="/admin/users" search={prev => ({ ...prev, user: user.id })}>
            <span className="font-medium wrap-anywhere">{user.display_name || user.username}</span>
          </Link>
          <span className="text-sm font-normal wrap-anywhere text-muted-foreground">@{user.username}</span>
        </span>
      </span>
    ),
  },
  {
    id: 'email',
    header: m.admin_users_col_email(),
    priority: 2,
    cell: user => <span className="text-muted-foreground">{user.email}</span>,
  },
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
      // The usual state is quiet text; only a disabled account gets a badge, so it stands out in a page of actives.
      const badge = userStatusBadges[user.status]
      return user.status === 'active' ? (
        <span className="text-muted-foreground">{badge.label()}</span>
      ) : (
        <StatusBadge tone={badge.tone}>{badge.label()}</StatusBadge>
      )
    },
  },
  {
    id: 'created',
    header: m.admin_users_col_created(),
    priority: 3,
    cell: user => <span className="text-muted-foreground tabular-nums">{formatDate(user.created_at_unix)}</span>,
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
