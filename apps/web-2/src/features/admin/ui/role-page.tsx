import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { DetailPage } from '#/shared/components/templates/detail-page'

import { canRole } from '../model/admin'
import { roleDescription, roleName } from '../model/roles'
import { rolesOptions } from '../queries'
import { DeleteRole } from './delete-role'
import { roleKindLabels } from './labels'
import { RoleEditSection } from './role-edit-section'
import { RolePermissionList } from './role-permission-list'
import { RolePermissionsSection } from './role-permissions-section'

/** One role: what it is and grants, and only the edits its `allowed_actions` list (system roles have none). */
export function RolePage() {
  const { roleSlug } = useParams({ from: '/_authed/admin/roles/$roleSlug' })
  const { data: roles } = useSuspenseQuery(rolesOptions())
  const role = roles.find(entry => entry.slug === roleSlug)
  // The loader answered "not found" for an unknown slug; a role just deleted renders nothing on the way out.
  if (!role) return null
  const description = roleDescription(role)
  return (
    <DetailPage
      title={roleName(role)}
      meta={m.admin_role_meta({ slug: role.slug, priority: role.priority })}
      status={<StatusBadge tone="neutral">{roleKindLabels[role.is_system ? 'system' : 'custom']()}</StatusBadge>}
      primaryAction={canRole(role, 'delete') ? <DeleteRole role={role} /> : null}
    >
      <Link to="/admin/roles">{m.admin_roles_all()}</Link>
      {description ? <p className="max-w-prose wrap-anywhere">{description}</p> : null}
      {canRole(role, 'update') ? <RoleEditSection role={role} /> : null}
      {canRole(role, 'set_permissions') ? (
        <RolePermissionsSection role={role} />
      ) : (
        <section aria-labelledby="role-permissions" className="flex flex-col gap-4">
          <h2 id="role-permissions" className="text-xl font-semibold">
            {m.admin_role_permissions()}
          </h2>
          <RolePermissionList permissions={role.permissions} />
        </section>
      )}
    </DetailPage>
  )
}
