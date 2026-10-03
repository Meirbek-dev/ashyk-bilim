import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { CreateCourseRequest } from '#/shared/api/gen/types.gen'
import { vCreateCourseRequest } from '#/shared/api/gen/valibot.gen'
import { Button } from '#/shared/ui/button'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { FormDialog } from '#/shared/ui/templates/form-dialog'

import { createCourseOptions } from '../queries'

const defaultValues: CreateCourseRequest = { name: '', about: '' }

/** "New course": a name and a short description, then the new course's workspace (DESIGN 8). No copy: no operation. */
export function CreateCourseDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const create = useMutation(createCourseOptions())
  const form = useAppForm(vCreateCourseRequest, {
    defaultValues,
    onSubmit: body =>
      create.mutateAsync(
        { body },
        {
          onSuccess: async course => {
            setOpen(false)
            toast(m.studio_course_created())
            await navigate({ to: '/teach/courses/$courseId/overview', params: { courseId: course.id } })
          },
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
      trigger={<Button>{m.studio_new_course()}</Button>}
      title={m.studio_new_course()}
      submitLabel={m.studio_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={create.error}
    >
      <form.AppField name="name">{field => <field.TextField label={m.studio_field_name()} required />}</form.AppField>
      <form.AppField name="about">{field => <field.TextareaField label={m.studio_field_about()} />}</form.AppField>
    </FormDialog>
  )
}
