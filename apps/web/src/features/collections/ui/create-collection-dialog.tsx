import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CreateCollectionRequest } from '#/shared/api/gen/types.gen'
import { vCreateCollectionRequest } from '#/shared/api/gen/valibot.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { createCollectionOptions } from '../queries'

const defaultValues: CreateCollectionRequest = { name: '', description: '', public: true }

/** "New collection": the minimum fields, then the new collection's page (DESIGN 8). Courses are added later. */
export function CreateCollectionDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const create = useMutation(createCollectionOptions())
  const idempotency = useIdempotencyKey()
  const form = useAppForm(vCreateCollectionRequest, {
    defaultValues,
    onSubmit: body =>
      create.mutateAsync(
        { body, headers: { 'Idempotency-Key': idempotency.key } },
        {
          onSuccess: async collection => {
            idempotency.settle()
            setOpen(false)
            toast.add({ title: m.collections_created() })
            await navigate({ to: '/collections/$collectionId', params: { collectionId: collection.id } })
          },
          onError: error => idempotency.settle(error),
        },
      ),
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
      trigger={<Button>{m.collections_new()}</Button>}
      title={m.collections_new()}
      submitLabel={m.collections_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={create.error}
    >
      <form.AppField name="name">
        {field => <field.TextField label={m.collections_field_name()} required />}
      </form.AppField>
      <form.AppField name="description">
        {field => <field.TextareaField label={m.collections_field_description()} />}
      </form.AppField>
      <form.AppField name="public">
        {field => (
          <field.SwitchField label={m.collections_field_public()} description={m.collections_field_public_hint()} />
        )}
      </form.AppField>
    </FormDialog>
  )
}
