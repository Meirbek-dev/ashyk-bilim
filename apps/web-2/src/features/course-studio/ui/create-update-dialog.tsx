import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { CreateCourseUpdateRequest } from '#/shared/api/gen/types.gen'
import { vCreateCourseUpdateRequest } from '#/shared/api/gen/valibot.gen'
import { Button } from '#/shared/ui/button'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { FormDialog } from '#/shared/ui/templates/form-dialog'

import { createUpdateOptions } from '../queries'

const defaultValues: CreateCourseUpdateRequest = { title: '', content: '' }

/** "New announcement": a title and markdown text; it heads the list at once. */
export function CreateUpdateDialog({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false)
  const create = useMutation(createUpdateOptions(useQueryClient(), courseId))
  const form = useAppForm(vCreateCourseUpdateRequest, {
    defaultValues,
    onSubmit: body =>
      create.mutateAsync(
        { path: { course_id: courseId }, body },
        {
          onSuccess: () => {
            changeOpen(false)
            toast(m.studio_update_created())
          },
        },
      ),
  })
  function changeOpen(next: boolean) {
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
      trigger={<Button variant="outline">{m.studio_update_new()}</Button>}
      title={m.studio_update_new()}
      submitLabel={m.studio_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={create.error}
    >
      <form.AppField name="title">
        {field => <field.TextField label={m.studio_update_field_title()} required />}
      </form.AppField>
      <form.AppField name="content">
        {field => <field.TextareaField label={m.studio_update_field_content()} required />}
      </form.AppField>
    </FormDialog>
  )
}
