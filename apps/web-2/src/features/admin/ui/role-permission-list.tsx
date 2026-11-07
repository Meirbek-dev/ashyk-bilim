import { m } from '#/paraglide/messages'
import { cn } from '#/shared/lib/utils'

import { grantAction, matrixActions, permissionGroups } from '../model/permissions'
import { GrantColumn } from './grant-column'

/** One track template for the head and every row, so the columns line up down the page. */
const MATRIX = '@4xl:grid @4xl:grid-cols-[11rem_repeat(4,minmax(0,1fr))_minmax(0,1.5fr)] @4xl:gap-x-4'

/**
 * A role's grants as a matrix: resources down, the everyday actions across, the scope in the cell; any other action is
 * named in the last column. On a phone each resource lists its actions, the scope beside each. The grant as the server sends
 * it is the item's tooltip; a grant with a part the catalog does not know is shown as sent. Read-only.
 */
export function RolePermissionList({ permissions }: { permissions: readonly string[] }) {
  if (permissions.length === 0)
    return <p className="text-sm text-muted-foreground">{m.admin_role_permissions_empty()}</p>
  const columns = matrixActions()
  const inColumns = new Set<string>(columns.map(column => column.key))
  return (
    <div className="flex flex-col text-sm">
      <div aria-hidden className={cn('hidden border-b pb-2 text-xs text-muted-foreground', MATRIX)}>
        <span>{m.admin_perm_field_resource()}</span>
        {columns.map(column => (
          <span key={column.key}>{column.label}</span>
        ))}
        <span>{m.admin_perm_other_actions()}</span>
      </div>
      <dl className="flex flex-col divide-y border-b">
        {permissionGroups(permissions).map(({ resource, grants }) => (
          <div key={resource} className={cn('flex flex-col gap-1.5 py-3 @4xl:py-2.5', MATRIX)}>
            <dt className="font-medium wrap-anywhere">{resource}</dt>
            <dd className="flex flex-col gap-0.5 @4xl:col-span-5 @4xl:grid @4xl:grid-cols-subgrid @4xl:gap-x-4">
              {columns.map(column => (
                <GrantColumn
                  key={column.key}
                  grants={grants.filter(words => grantAction(words.grant) === column.key)}
                />
              ))}
              <GrantColumn named grants={grants.filter(words => !inColumns.has(grantAction(words.grant)))} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
