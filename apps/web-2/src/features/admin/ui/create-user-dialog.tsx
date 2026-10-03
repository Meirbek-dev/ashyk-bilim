import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
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

const defaultValues: CreateUserRequest = { first_name: '', last_name: '', username: '', email: '', password: '' }
// An empty password field means "none" (Google only): only a typed one must meet the contract's length.
const schema = v.object({
  ...vCreateUserRequest.entries,
  password: v.union([v.literal(''), vCreateUserRequest.entries.password]),
})

/**
 * "New user": the account with a verified email and the `user` role; roles are added in the panel that opens next.
 * No password = Google sign-in only. A taken username or email lands under its field.
 */
export function CreateUserDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const create = useMutation(createUserOptions())
  const form = useAppForm(schema, {
    defaultValues,
    onSubmit: body =>
      create
        .mutateAsync(
          { body: { ...body, password: body.password || undefined } },
          {
            onSuccess: async user => {
              setOpen(false)
              form.reset()
              toast.add({ title: m.admin_user_created() })
              await navigate({ to: '/admin/users', search: prev => ({ ...prev, user: user.username }) })
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
      <form.AppField name="first_name">
        {field => <field.TextField label={m.admin_user_field_first_name()} autoComplete="off" required />}
      </form.AppField>
      <form.AppField name="last_name">
        {field => <field.TextField label={m.admin_user_field_last_name()} autoComplete="off" required />}
      </form.AppField>
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
    </FormDialog>
  )
}
