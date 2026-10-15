import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { roleName } from '../model/roles'
import { rolesOptions } from '../queries'
import { FilterMenu } from './filter-menu'

const ALL = 'all'

/** Holders of one role (`?role=<slug>`), the roles named as on the roles page; an unknown slug reads as itself. */
export function RoleFilter({ role, onPick }: { role: string | undefined; onPick: (role: string | undefined) => void }) {
  const { data: roles } = useSuspenseQuery(rolesOptions())
  const current = roles.find(item => item.slug === role)
  return (
    <FilterMenu
      choice={{
        label: m.admin_users_role_label({
          role: role ? (current ? roleName(current) : role) : m.admin_users_filter_all(),
        }),
        value: role ?? ALL,
        options: [
          { value: ALL, label: m.admin_users_filter_all() },
          ...roles.map(item => ({ value: item.slug, label: roleName(item) })),
        ],
        onValueChange: value => onPick(value === ALL ? undefined : value),
      }}
    />
  )
}
