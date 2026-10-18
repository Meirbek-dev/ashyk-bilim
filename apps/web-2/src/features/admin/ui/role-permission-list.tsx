import { m } from '#/paraglide/messages'

import { permissionsByResource } from '../model/admin'

/**
 * A role's permission strings as the server sends them, grouped by resource: the resource once on the left, its grants
 * (the strings as sent) on the right, one row per resource. Read-only.
 */
export function RolePermissionList({ permissions }: { permissions: readonly string[] }) {
  if (permissions.length === 0) return <p className="text-muted-foreground">{m.admin_role_permissions_empty()}</p>
  return (
    <dl className="flex max-w-4xl flex-col divide-y border-y text-sm">
      {permissionsByResource(permissions).map(([resource, grants]) => (
        <div key={resource} className="flex flex-col gap-1 py-2 @xl:grid @xl:grid-cols-4 @xl:gap-gutter">
          <dt className="font-mono font-medium">{resource}</dt>
          <dd className="@xl:col-span-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-muted-foreground">
              {grants.map(grant => (
                <li key={grant} className="wrap-anywhere">
                  {grant}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  )
}
