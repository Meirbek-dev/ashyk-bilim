import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
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
      back={
        <RouterLink to="/admin/roles" activeOptions={{ exact: true }} className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft aria-hidden />
          {m.admin_roles_all()}
        </RouterLink>
      }
      title={roleName(role)}
      meta={`${roleKindLabels[role.is_system ? 'system' : 'custom']()} · ${m.admin_role_meta({ slug: role.slug, priority: role.priority })}`}
    >
      {description ? <p className="max-w-prose wrap-anywhere">{description}</p> : null}
      {/* What this page is for comes first: what the role may do; its name and removal after. */}
      <div className="flex flex-col gap-12 pt-4">
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
        {canRole(role, 'update') ? <RoleEditSection role={role} base={base} /> : null}
        {canRole(role, 'delete') ? <DeleteRole role={role} /> : null}
      </div>
    </DetailPage>
  )
}
