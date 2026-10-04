import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AdminUser } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { groupChoiceSchema } from '../model/admin'
import { addMembersOptions } from '../group-queries'
import { groupChoicesOptions } from '../queries'

/** "Add to group": the groups the caller may change the members of (`manage_members`). Shown with `groups.manage`. */
export function UserGroup({ user }: { user: AdminUser }) {
  const { data: groups } = useSuspenseQuery(groupChoicesOptions())
  const add = useMutation(addMembersOptions(useQueryClient()))
  const member = { id: user.id, username: user.username, display_name: user.display_name, avatar_key: null }
  const form = useAppForm(groupChoiceSchema, {
    defaultValues: { group: '' },
    onSubmit: ({ group }) =>
      add.mutateAsync(
        { group, members: [member] },
        {
          onSuccess: () => {
            toast.add({ title: m.admin_user_group_added() })
            form.reset()
          },
        },
      ),
  })
  return (
    <section aria-labelledby="user-groups" className="flex flex-col gap-2">
      <h3 id="user-groups" className="font-medium">
        {m.admin_user_group_title()}
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.admin_user_group_none()}</p>
      ) : (
        <form
          noValidate
          className="flex flex-wrap items-end gap-2"
          onSubmit={event => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppField name="group">
            {field => (
              <field.SelectField
                label={m.admin_user_group_field()}
                options={[
                  { value: '', label: m.admin_user_group_choose() },
                  ...groups.map(group => ({ value: group.id, label: group.name })),
                ]}
              />
            )}
          </form.AppField>
          <Button type="submit" variant="outline" disabled={add.isPending}>
            {add.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.admin_user_group_add()}
          </Button>
        </form>
      )}
      {add.error ? <ErrorAlert>{presentError(add.error)}</ErrorAlert> : null}
    </section>
  )
}
