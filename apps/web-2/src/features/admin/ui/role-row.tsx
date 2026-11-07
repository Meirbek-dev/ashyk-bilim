import type { Role } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { permissionSummary, roleDescription, roleName } from '../model/roles'
import { roleKind } from './role-kind'

/** The same row on a phone: the rank hanging, the name and slug, what the role is for, its kind and grants. */
export function RoleRow({ role }: { role: Role }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-8 shrink-0 text-right font-heading text-lg tabular-nums">{role.priority}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-medium">
          <Link variant="stretched" to="/admin/roles/$roleSlug" params={{ roleSlug: role.slug }}>
            <span className="wrap-anywhere">{roleName(role)}</span>
          </Link>
          <code className="font-mono text-xs font-normal wrap-anywhere text-muted-foreground">{role.slug}</code>
        </h3>
        <p className="text-muted-foreground">{roleDescription(role)}</p>
        <p className="flex flex-wrap items-center gap-x-2 tabular-nums">
          {roleKind(role)}
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span>{permissionSummary(role.permissions)}</span>
        </p>
      </div>
    </div>
  )
}
