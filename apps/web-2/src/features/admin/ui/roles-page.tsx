import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import type { Role } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataList } from '#/shared/components/data-list'
import { DataTable } from '#/shared/components/data-table'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ListPage } from '#/shared/components/templates/list-page'

import { permissionSummary, roleDescription, roleName } from '../model/roles'
import { rolesOptions } from '../queries'
import { CreateRoleDialog } from './create-role-dialog'
import { roleKind } from './role-kind'
import { RoleRow } from './role-row'
import { tableOnPage } from './table-layout'

const columns: DataColumn<Role>[] = [
  {
    id: 'priority',
    header: m.admin_role_priority(),
    priority: 3,
    // A hanging numeral: the list runs down the roles' rank, so the rank opens the row.
    cell: role => <span className="block text-right font-heading text-lg tabular-nums">{role.priority}</span>,
  },
  {
    id: 'name',
    header: m.admin_field_name(),
    priority: 1,
    cell: role => (
      <span className="flex flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Link variant="title" to="/admin/roles/$roleSlug" params={{ roleSlug: role.slug }}>
            <span className="font-medium wrap-anywhere">{roleName(role)}</span>
          </Link>
          <code className="font-mono text-xs wrap-anywhere text-muted-foreground">{role.slug}</code>
        </span>
        <span className="text-muted-foreground">{roleDescription(role)}</span>
      </span>
    ),
  },
  { id: 'kind', header: m.admin_role_kind(), priority: 2, cell: roleKind },
  {
    id: 'permissions',
    header: m.admin_role_permissions(),
    priority: 2,
    cell: role => <span className="tabular-nums">{permissionSummary(role.permissions)}</span>,
  },
]

/** Every role in the server's order; a role's permissions and edits live on its page. */
export function RolesPage() {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const query = useSuspenseQuery(rolesOptions())
  return (
    <ListPage
      title={m.admin_roles_title()}
      count={m.admin_roles_count({ count: query.data.length })}
      primaryAction={hasCapability(session, 'admin.roles.create') ? <CreateRoleDialog /> : null}
    >
      <ListState
        pending={false}
        error={query.error}
        count={query.data.length}
        filtered={false}
        emptyText={m.admin_roles_empty()}
        onRetry={() => void query.refetch()}
      >
        <div className={`hidden @2xl:block ${tableOnPage} [&_th:first-child]:w-20 [&_th:first-child]:text-right`}>
          <DataTable label={m.admin_roles_table()} rows={query.data} columns={columns} getKey={role => role.slug} />
        </div>
        <div className="@2xl:hidden">
          <DataList items={query.data} getKey={role => role.slug} variant="rows">
            {role => <RoleRow role={role} />}
          </DataList>
        </div>
      </ListState>
    </ListPage>
  )
}
