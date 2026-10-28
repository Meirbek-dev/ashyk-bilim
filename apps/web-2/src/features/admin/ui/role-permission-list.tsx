import { m } from '#/paraglide/messages'

import { permissionGroups } from '../model/permissions'

/**
 * A role's grants in words, grouped by resource: the resource once on the left, «Просмотр · без ограничений»… on the
 * right. The grant as the server sends it is the item's tooltip; a grant with a part the catalog does not know is shown
 * as sent. Read-only.
 */
export function RolePermissionList({ permissions }: { permissions: readonly string[] }) {
  if (permissions.length === 0) return <p className="text-sm text-muted-foreground">{m.admin_role_permissions_empty()}</p>
  return (
    <dl className="flex max-w-4xl flex-col divide-y border-y text-sm">
      {permissionGroups(permissions).map(({ resource, grants }) => (
        <div key={resource} className="flex flex-col gap-1 py-2 @xl:grid @xl:grid-cols-4 @xl:gap-gutter">
          <dt className="font-medium">{resource}</dt>
          <dd className="@xl:col-span-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {grants.map(({ grant, action, scope }) => (
                <li key={grant} title={grant} className="wrap-anywhere">
                  {action === null || scope === null ? (
                    <span className="font-mono text-muted-foreground">{grant}</span>
                  ) : (
                    <>
                      {action} <span className="text-muted-foreground">· {scope}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  )
}
