import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { MultiSelectField } from '#/shared/components/form/multi-select-field'

import { canRole } from '../model/admin'
import { roleName } from '../model/roles'
import { rolesOptions } from '../queries'

/** The new user's extra roles (B-ADM-07): the ones the caller may assign, by name; inside `form.AppField name="roles"`. */
export function CreateUserRoles() {
  const { data: roles } = useSuspenseQuery(rolesOptions())
  const options = roles
    .filter(role => canRole(role, 'assign'))
    .map(role => ({ value: role.slug, label: roleName(role) }))
  return (
    <MultiSelectField
      label={m.admin_user_field_roles()}
      description={m.admin_user_field_roles_hint()}
      options={options}
    />
  )
}
