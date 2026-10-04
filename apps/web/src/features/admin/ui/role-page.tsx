import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { DetailPage } from '#/shared/components/templates/detail-page'

import { canRole } from '../model/admin'
import { roleDescription, roleName } from '../model/roles'
import { roleOptions } from '../queries'
import { DeleteRole } from './delete-role'
import { roleKindLabels } from './labels'
import { RoleEditSection } from './role-edit-section'
import { RolePermissionList } from './role-permission-list'
import { RolePermissionsSection } from './role-permissions-section'

/** One role: what it is and grants, and only the edits its `allowed_actions` list (system roles have none). */
export function RolePage() {
  const { roleSlug } = useParams({ from: '/_authed/admin/roles/$roleSlug' })
  const { data: role } = useSuspenseQuery(roleOptions(roleSlug))
  const description = roleDescription(role)
  // Both sections write the same role: they share the version their forms are based on.
  const base = useState(role.version)
  return (
    <DetailPage
      title={roleName(role)}
      meta={m.admin_role_meta({ slug: role.slug, priority: role.priority })}
      status={<StatusBadge tone="neutral">{roleKindLabels[role.is_system ? 'system' : 'custom']()}</StatusBadge>}
      primaryAction={canRole(role, 'delete') ? <DeleteRole role={role} /> : null}
    >
      <Link to="/admin/roles">{m.admin_roles_all()}</Link>
      {description ? <p className="max-w-prose wrap-anywhere">{description}</p> : null}
      {canRole(role, 'update') ? <RoleEditSection role={role} base={base} /> : null}
      {canRole(role, 'set_permissions') ? (
        <RolePermissionsSection role={role} base={base} />
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
