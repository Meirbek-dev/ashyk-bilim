import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

import type { UsersSearch } from '../route'
import { FilterMenu } from './filter-menu'
import { userStatusBadges } from './labels'
import { RoleFilter } from './role-filter'

const ALL = 'all'
const sortLabels = { newest: m.admin_users_sort_newest, name: m.admin_users_sort_name } as const

/** The directory's order and filters (B-ADM-26), each in the URL; the role filter needs the roles list. */
export function UsersFilters({ search, namedRoles }: { search: UsersSearch; namedRoles: boolean }) {
  const navigate = useNavigate()
  const go = (patch: Partial<UsersSearch>) =>
    void navigate({ to: '/admin/users', search: { ...search, ...patch, user: undefined } })
  const sort = search.sort ?? 'newest'
  return (
    <div className="flex flex-wrap gap-2">
      <FilterMenu
        choice={{
          label: m.admin_users_sort_label({ sort: sortLabels[sort]() }),
          value: sort,
          options: (['newest', 'name'] as const).map(value => ({ value, label: sortLabels[value]() })),
          onValueChange: value => go({ sort: value === 'name' ? 'name' : undefined }),
        }}
      />
      <FilterMenu
        choice={{
          label: m.admin_users_status_label({
            status: search.status ? userStatusBadges[search.status].label() : m.admin_users_filter_all(),
          }),
          value: search.status ?? ALL,
          options: [
            { value: ALL, label: m.admin_users_filter_any() },
            ...(['active', 'disabled'] as const).map(value => ({ value, label: userStatusBadges[value].label() })),
          ],
          onValueChange: value => go({ status: value === 'active' || value === 'disabled' ? value : undefined }),
        }}
      />
      {namedRoles ? <RoleFilter role={search.role} onPick={role => go({ role })} /> : null}
    </div>
  )
}
