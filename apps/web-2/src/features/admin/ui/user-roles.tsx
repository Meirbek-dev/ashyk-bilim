import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AdminUser } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { IconButton } from '#/shared/components/icon-button'
import { StatusBadge } from '#/shared/components/status-badge'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { canRole, canUser, roleChoiceSchema } from '../model/admin'
import { roleName } from '../model/roles'
import { assignRoleOptions, rolesOptions, unassignRoleOptions } from '../queries'

/** The user's roles; with `manage_roles` each can be removed and a role with `assign` added. */
export function UserRoles({ user }: { user: AdminUser }) {
  const { data: roles } = useSuspenseQuery(rolesOptions())
  const queryClient = useQueryClient()
  const assign = useMutation(assignRoleOptions(queryClient))
  const unassign = useMutation(unassignRoleOptions(queryClient))
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
  const remove = (slug: string) =>
    unassign.mutate(
      { path: { user_id: user.id, slug } },
      { onSuccess: () => toast.add({ title: m.admin_user_role_removed() }) },
    )
  const error = assign.error ?? unassign.error
  return (
    <section aria-labelledby="user-roles" className="flex flex-col gap-2">
      <h3 id="user-roles" className="font-medium">
        {m.admin_users_col_roles()}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {user.roles.map(slug => (
          <li key={slug} className="flex items-center gap-1">
            <StatusBadge tone="neutral">{nameOf(slug)}</StatusBadge>
            {manage ? (
              <IconButton
                label={m.admin_user_role_remove({ role: nameOf(slug) })}
                icon={<X aria-hidden />}
                disabled={unassign.isPending}
                onClick={() => remove(slug)}
              />
            ) : null}
          </li>
        ))}
      </ul>
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
          <Button type="submit" variant="outline" disabled={assign.isPending}>
            {assign.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.admin_add()}
          </Button>
        </form>
      ) : null}
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
    </section>
  )
}
