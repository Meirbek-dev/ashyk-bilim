import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AdminUser } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataList } from '#/shared/components/data-list'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { UserAvatar } from '#/shared/components/user-avatar'
import { formatDate } from '#/shared/i18n/format'

import { usersListOptions, type UsersFilter } from '../queries'
import { userName } from '../model/admin'
import { userStatus } from './user-state'
import { UserRow } from './user-row'
import { RoleNames } from './role-names'
import { tableOnPage } from './table-layout'

const columns = (namedRoles: boolean): DataColumn<AdminUser>[] => [
  {
    id: 'user',
    header: m.admin_users_col_user(),
    priority: 1,
    // The panel opens from the URL (R-07): this link is the shareable address of the user.
    cell: user => (
      <span className="flex items-center gap-3">
        <UserAvatar name={userName(user)} avatarKey={user.avatar_key} />
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <Link variant="title" from="/admin/users" to="/admin/users" search={prev => ({ ...prev, user: user.id })}>
            <span className="font-medium wrap-anywhere">{userName(user)}</span>
          </Link>
          {/* A deleted account's login is a `deleted-<id>` placeholder: nothing to read. */}
          {user.deleted ? null : (
            <span className="font-normal wrap-anywhere text-muted-foreground">@{user.username}</span>
          )}
        </span>
      </span>
    ),
  },
  {
    id: 'email',
    header: m.admin_users_col_email(),
    priority: 2,
    cell: user => (user.deleted ? null : <span className="wrap-anywhere text-muted-foreground">{user.email}</span>),
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
    cell: userStatus,
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
      <div className={`hidden @2xl:block ${tableOnPage}`}>
        <DataTable label={m.admin_users_table()} rows={users} columns={columns(namedRoles)} getKey={user => user.id} />
      </div>
      <div className="@2xl:hidden">
        <DataList items={users} getKey={user => user.id} variant="rows">
          {user => <UserRow user={user} namedRoles={namedRoles} />}
        </DataList>
      </div>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
