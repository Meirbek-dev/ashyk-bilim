import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Role } from '#/shared/api/gen/types.gen'
import { Badge } from '#/shared/ui/badge'
import type { DataColumn } from '#/shared/ui/data-columns'
import { DataTable } from '#/shared/ui/data-table'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'
import { ListPage } from '#/shared/ui/templates/list-page'

import { roleName } from '../model/roles'
import { rolesOptions } from '../queries'
import { CreateRoleDialog } from './create-role-dialog'
import { roleKindLabels } from './labels'

const columns: DataColumn<Role>[] = [
  {
    id: 'name',
    header: m.admin_field_name(),
    priority: 1,
    cell: role => (
      <span className="wrap-anywhere">
        <Link to="/admin/roles/$roleSlug" params={{ roleSlug: role.slug }}>
          {roleName(role)}
        </Link>
      </span>
    ),
  },
  { id: 'slug', header: m.admin_role_slug(), priority: 2, cell: role => <code>{role.slug}</code> },
  {
    id: 'kind',
    header: m.admin_role_kind(),
    priority: 2,
    cell: role => <Badge tone="neutral">{roleKindLabels[role.is_system ? 'system' : 'custom']()}</Badge>,
  },
  {
    id: 'permissions',
    header: m.admin_role_permissions(),
    priority: 2,
    cell: role => (
      <span className="tabular-nums">{m.admin_role_permission_count({ count: role.permissions.length })}</span>
    ),
  },
  {
    id: 'priority',
    header: m.admin_role_priority(),
    priority: 3,
    cell: role => <span className="tabular-nums">{role.priority}</span>,
  },
]

/** Every role in the server's order; a role's permissions and edits live on its page. */
export function RolesPage() {
  const query = useSuspenseQuery(rolesOptions())
  return (
    <ListPage title={m.admin_roles_title()} primaryAction={<CreateRoleDialog />}>
      <ListState
        pending={false}
        error={query.error}
        count={query.data.length}
        filtered={false}
        emptyText={m.admin_roles_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataTable label={m.admin_roles_table()} rows={query.data} columns={columns} getKey={role => role.slug} />
      </ListState>
    </ListPage>
  )
}
