import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AdminUser } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { canRole, canUser, roleChoiceSchema } from '../model/admin'
import { roleName } from '../model/roles'
import { assignRoleOptions, rolesOptions } from '../queries'
import { RoleList } from './user-role-list'

/**
 * The user's roles; with `manage_roles` each can be removed (after a confirmation naming the role and the user: a
 * stray click on «×» took an administrator's rights at once) and a role with `assign` added.
 */
export function UserRoles({ user }: { user: AdminUser }) {
  const { data: roles } = useSuspenseQuery(rolesOptions())
  const queryClient = useQueryClient()
  const assign = useMutation(assignRoleOptions(queryClient))
  const manage = canUser(user, 'manage_roles')
  const nameOf = (slug: string) => {
    const role = roles.find(entry => entry.slug === slug)
    return role ? roleName(role) : slug
  }
  const addable = roles.filter(role => canRole(role, 'assign') && !user.roles.includes(role.slug))
  const form = useAppForm(roleChoiceSchema, {
    defaultValues: { role: '' },
    onSubmit: ({ role }) =>
      assign.mutateAsync(
        { path: { user_id: user.id }, body: { role } },
        {
          onSuccess: () => {
            toast.add({ title: m.admin_user_role_added() })
            form.reset()
          },
        },
      ),
  })
  const error = assign.error
  return (
    <section aria-labelledby="user-roles" className="flex flex-col gap-2">
      <h3 id="user-roles" className="font-medium">
        {m.admin_users_col_roles()}
      </h3>
      <RoleList user={user} manage={manage} nameOf={nameOf} />
      {manage && addable.length > 0 ? (
        <form
          noValidate
          className="flex flex-wrap items-end gap-2"
          onSubmit={event => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppField name="role">
            {field => (
              <field.SelectField
                label={m.admin_user_role_add()}
                options={[
                  { value: '', label: m.admin_user_role_choose() },
                  ...addable.map(role => ({ value: role.slug, label: roleName(role) })),
                ]}
              />
            )}
          </form.AppField>
          <SubmitButton type="submit" variant="outline" pending={assign.isPending}>
            {m.admin_add()}
          </SubmitButton>
        </form>
      ) : null}
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
    </section>
  )
}
