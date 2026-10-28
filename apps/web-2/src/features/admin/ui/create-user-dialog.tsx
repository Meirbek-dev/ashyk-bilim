import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { CreateUserRequest } from '#/shared/api/gen/types.gen'
import { vCreateUserRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { takenField } from '../model/admin'
import { createUserOptions } from '../queries'
import { CreateUserRoles } from './create-user-roles'

const defaultValues: CreateUserRequest = {
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  password: '',
  roles: [],
}
// An empty password field means "none" (Google only): only a typed one must meet the contract's length.
const schema = v.object({
  ...vCreateUserRequest.entries,
  password: v.union([v.literal(''), vCreateUserRequest.entries.password]),
  // The contract checks only the length: a blank or mistyped address reached the server (and an account with no
  // password and no address cannot sign in at all).
  email: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.email(), v.maxLength(320)),
})

/** Blank password and no extra roles are left out (Google-only sign-in, the default role). */
const requestOf = (body: CreateUserRequest): CreateUserRequest => ({
  ...body,
  password: body.password || undefined,
  roles: body.roles?.length ? body.roles : undefined,
})

/**
 * "New user": the account with a verified email, the `user` role and the extra roles picked here (when the caller
 * reads roles); the panel opens next. No password = Google sign-in only. A taken username or email lands under its
 * field.
 */
export function CreateUserDialog({ withRoles }: { withRoles: boolean }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const create = useMutation(createUserOptions())
  const form = useAppForm(schema, {
    defaultValues,
    onSubmit: body =>
      create
        .mutateAsync(
          { body: requestOf(body) },
          {
            onSuccess: async user => {
              setOpen(false)
              form.reset()
              toast.add({ title: m.admin_user_created() })
              await navigate({ to: '/admin/users', search: { user: user.id } })
            },
          },
        )
        .catch((error: unknown) => {
          const field = takenField(error)
          if (field !== 'username' && field !== 'email') throw error
          form.setFieldMeta(field, meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: presentError(error) } }))
        }),
  })
  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      form.reset()
      create.reset()
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      trigger={<Button>{m.admin_user_new()}</Button>}
      title={m.admin_user_new()}
      submitLabel={m.admin_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={takenField(create.error) ? null : create.error}
    >
      {/* First and last name side by side: two short values, as on a sign-up form. */}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <form.AppField name="first_name">
          {field => <field.TextField label={m.admin_user_field_first_name()} autoComplete="off" required />}
        </form.AppField>
        <form.AppField name="last_name">
          {field => <field.TextField label={m.admin_user_field_last_name()} autoComplete="off" required />}
        </form.AppField>
      </div>
      <form.AppField name="username">
        {field => <field.TextField label={m.admin_user_username()} autoComplete="off" required />}
      </form.AppField>
      <form.AppField name="email">
        {field => <field.TextField label={m.admin_user_field_email()} type="email" autoComplete="off" required />}
      </form.AppField>
      <form.AppField name="password">
        {field => (
          <field.TextField
            label={m.admin_user_field_password()}
            description={m.admin_user_field_password_hint()}
            type="password"
            autoComplete="new-password"
          />
        )}
      </form.AppField>
      {withRoles ? (
        <form.AppField name="roles">
          {() => (
            <Suspense fallback={null}>
              <CreateUserRoles />
            </Suspense>
          )}
        </form.AppField>
      ) : null}
    </FormDialog>
  )
}
