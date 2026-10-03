import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { roleFormSchema, takenField } from '../model/admin'
import { createRoleOptions } from '../queries'

const defaultValues = { slug: '', display_name: '', description: '', priority: '10' }

/** "New role": slug, name, description, priority; then the role's page, where its permissions are set. */
export function CreateRoleDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const create = useMutation(createRoleOptions())
  const form = useAppForm(roleFormSchema, {
    defaultValues,
    onSubmit: ({ priority, description, ...rest }) =>
      create
        .mutateAsync(
          { body: { ...rest, description: description.trim() || undefined, priority: Number(priority) } },
          {
            onSuccess: async () => {
              setOpen(false)
              form.reset()
              toast.add({ title: m.admin_role_created() })
              await navigate({ to: '/admin/roles/$roleSlug', params: { roleSlug: rest.slug } })
            },
          },
        )
        .catch((error: unknown) => {
          if (takenField(error) !== 'slug') throw error
          form.setFieldMeta('slug', meta => ({
            ...meta,
            errorMap: { ...meta.errorMap, onSubmit: presentError(error) },
          }))
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
      trigger={<Button>{m.admin_role_new()}</Button>}
      title={m.admin_role_new()}
      submitLabel={m.admin_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={takenField(create.error) ? null : create.error}
    >
      <form.AppField name="slug">
        {field => (
          <field.TextField
            label={m.admin_role_slug()}
            description={m.admin_role_slug_hint()}
            autoComplete="off"
            required
          />
        )}
      </form.AppField>
      <form.AppField name="display_name">
        {field => <field.TextField label={m.admin_field_name()} required />}
      </form.AppField>
      <form.AppField name="description">
        {field => <field.TextareaField label={m.admin_field_description()} />}
      </form.AppField>
      <form.AppField name="priority">
        {field => (
          <field.TextField
            label={m.admin_role_priority()}
            description={m.admin_role_priority_hint()}
            inputMode="numeric"
            required
          />
        )}
      </form.AppField>
    </FormDialog>
  )
}
