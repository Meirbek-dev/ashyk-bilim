import { m } from '#/paraglide/messages'

import { permissionsByResource } from '../model/admin'

/** A role's permission strings as the server sends them, grouped by resource. Read-only. */
export function RolePermissionList({ permissions }: { permissions: readonly string[] }) {
  if (permissions.length === 0) return <p className="text-muted-foreground">{m.admin_role_permissions_empty()}</p>
  return (
    <dl className="flex flex-col gap-4">
      {permissionsByResource(permissions).map(([resource, grants]) => (
        <div key={resource} className="flex flex-col gap-1">
          <dt className="font-medium">
            <code>{resource}</code>
          </dt>
          <dd>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {grants.map(grant => (
                <li key={grant}>
                  <code className="wrap-anywhere">{grant}</code>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  )
}
