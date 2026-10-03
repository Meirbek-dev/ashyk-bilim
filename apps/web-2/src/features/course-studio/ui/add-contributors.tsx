import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense, useState } from 'react'

import { PeoplePicker } from '#/features/admin'
import { m } from '#/paraglide/messages'
import type { UserHit } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Skeleton } from '#/shared/ui/skeleton'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

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
            toast.add({ title: m.studio_team_added() })
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
        <Suspense fallback={<Skeleton className="h-row w-full" />}>
          <PeoplePicker label={m.studio_team_people()} value={people} onValueChange={setPeople} />
        </Suspense>
      </div>
      <form.AppField name="role">
        {field => <field.SelectField label={m.studio_role_label()} options={roleOptions} />}
      </form.AppField>
      <Button type="submit" variant="outline" disabled={people.length === 0 || add.isPending}>
        {add.isPending ? <Spinner data-icon="inline-start" /> : null}
        {m.studio_team_add_submit()}
      </Button>
      {add.error ? <ErrorAlert>{presentError(add.error)}</ErrorAlert> : null}
    </form>
  )
}
