import { useState } from 'react'
import * as v from 'valibot'
import { describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { Button } from '#/shared/ui/button'

import { useAppForm } from '../form/use-app-form'
import { renderInRouter } from '../testing'
import { FormDialog } from './form-dialog'

const schema = v.object({ name: v.pipe(v.string(), v.minLength(1)), slug: v.string() })
type Body = v.InferOutput<typeof schema>
const text = { open: 'New', title: 'New collection', create: 'Create', name: 'Name', slug: 'Slug' }

function CreateDialog({ submit }: { submit: (body: Body) => Promise<void> }) {
  const [open, setOpen] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const form = useAppForm(schema, {
    defaultValues: { name: '', slug: '' },
    onSubmit: body =>
      submit(body).catch((failure: unknown) => {
        setError(failure)
        throw failure
      }),
  })
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button>{text.open}</Button>}
      title={text.title}
      submitLabel={text.create}
      onSubmit={() => form.handleSubmit()}
      pending={false}
      error={error}
    >
      <form.AppField name="name">{field => <field.TextField label={text.name} />}</form.AppField>
      <form.AppField name="slug">{field => <field.TextField label={text.slug} />}</form.AppField>
    </FormDialog>
  )
}

const unprocessable = new ApiError({
  status: 422,
  code: 'validation-failed',
  fieldErrors: [{ field: 'slug', code: 'duplicate', message: 'slug is taken' }],
  requestId: 'req-1',
  retryAfter: null,
})

describe('FormDialog', () => {
  test('the schema blocks an empty submit and says why under the field', async () => {
    const submit = vi.fn<(body: Body) => Promise<void>>()
    const screen = await renderInRouter(<CreateDialog submit={submit} />)
    const dialog = screen.getByRole('dialog', { name: text.title })
    await dialog.getByRole('button', { name: text.create }).click()
    await expect.element(dialog.getByText(m.validation_required())).toBeVisible()
    await expect.element(dialog.getByLabelText(text.name)).toHaveAttribute('aria-invalid', 'true')
    expect(submit).not.toHaveBeenCalled()
  })

  test('submits the values; a 422 puts field_errors under the field and the code text in the dialog', async () => {
    const submit = vi.fn<(body: Body) => Promise<void>>().mockRejectedValue(unprocessable)
    const screen = await renderInRouter(<CreateDialog submit={submit} />)
    const dialog = screen.getByRole('dialog', { name: text.title })
    await dialog.getByLabelText(text.name).fill('Algebra')
    await dialog.getByLabelText(text.slug).fill('algebra')
    await dialog.getByRole('button', { name: text.create }).click()
    expect(submit).toHaveBeenCalledWith({ name: 'Algebra', slug: 'algebra' })
    await expect.element(dialog.getByText(m.validation_duplicate())).toBeVisible()
    await expect.element(dialog.getByRole('alert').filter({ hasText: m.errors_validation_failed() })).toBeVisible()
  })
})
