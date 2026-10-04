import { useSuspenseQuery } from '@tanstack/react-query'

import { roleNames } from '../model/roles'
import { rolesOptions } from '../queries'

/** A user's roles by name. Rendered only with `admin.roles` (the role list needs it); otherwise the slugs show. */
export function RoleNames({ slugs }: { slugs: readonly string[] }) {
  const { data: roles } = useSuspenseQuery(rolesOptions())
  return roleNames(slugs, roles).join(', ')
}
