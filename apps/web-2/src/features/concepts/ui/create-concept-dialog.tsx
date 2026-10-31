import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId, CreateConceptRequest } from '#/shared/api/gen/types.gen'
import { vCreateConceptRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { createOptions } from '../queries'

const defaultValues: CreateConceptRequest = { name: '', description: '' }

/** «New concept» (B-CON-05): a name and a description; the teacher's own concept is approved at once. */
export function CreateConceptDialog({ courseId }: { courseId: CourseId }) {
  const [open, setOpen] = useState(false)
  const create = useMutation(createOptions(courseId))
  const form = useAppForm(vCreateConceptRequest, {
    defaultValues,
    onSubmit: body =>
      create.mutateAsync(
        { path: { course_id: courseId }, body },
        {
          onSuccess: () => {
            changeOpen(false)
            toast.add({ title: m.concepts_created() })
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
      trigger={<Button variant="outline">{m.concepts_new()}</Button>}
      title={m.concepts_new()}
      submitLabel={m.concepts_create()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={create.error}
    >
      <form.AppField name="name">{field => <field.TextField label={m.concepts_field_name()} required />}</form.AppField>
      <form.AppField name="description">
        {field => <field.TextareaField label={m.concepts_field_description()} />}
      </form.AppField>
    </FormDialog>
  )
}
