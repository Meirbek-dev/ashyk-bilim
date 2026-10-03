import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { PeoplePicker } from '#/features/admin'
import { m } from '#/paraglide/messages'
import type { UserHit } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { Skeleton } from '#/shared/ui/skeleton'

import { ASSIGNABLE_ROLES, type RoleForm, roleSchema } from '../model/studio'
import { addContributorsOptions } from '../queries'
import { roleLabels } from './role-labels'

const defaultRole: RoleForm = { role: 'contributor' }
const roleOptions = ASSIGNABLE_ROLES.map(value => ({ value, label: roleLabels[value]() }))

/** "Add co-authors": people found by name (several at once) with one role; each joins the roster as active. */
export function AddContributors({ courseId }: { courseId: string }) {
  const add = useMutation(addContributorsOptions(useQueryClient(), courseId))
  const [people, setPeople] = useState<UserHit[]>([])
  const form = useAppForm(roleSchema, {
    defaultValues: defaultRole,
    onSubmit: ({ role }) =>
      add.mutateAsync(
        { userIds: people.map(person => person.id), role },
        {
          onSuccess: () => {
            setPeople([])
            toast(m.studio_team_added())
          },
        },
      ),
  })
  return (
    <form
      noValidate
      aria-label={m.studio_team_add()}
      className="flex flex-col items-start gap-4"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="w-full">
        <Suspense fallback={<Skeleton shape="row" />}>
          <PeoplePicker label={m.studio_team_people()} value={people} onValueChange={setPeople} />
        </Suspense>
      </div>
      <form.AppField name="role">
        {field => <field.SelectField label={m.studio_role_label()} options={roleOptions} />}
      </form.AppField>
      <Button type="submit" variant="outline" pending={add.isPending} disabled={people.length === 0}>
        {m.studio_team_add_submit()}
      </Button>
      {add.error ? <Alert>{presentError(add.error)}</Alert> : null}
    </form>
  )
}
