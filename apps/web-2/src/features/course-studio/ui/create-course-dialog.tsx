import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { vCreateCourseRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { createCourseOptions, duplicateCourseOptions } from '../queries'
import { SourceField } from './source-field'

/** `source`: the course to copy, empty for a blank course. */
const schema = v.object({ ...vCreateCourseRequest.entries, source: v.string() })
const defaultValues = { name: '', about: '', source: '' }

function useCreateForm(onCreated: (course: Course) => Promise<void>) {
  const create = useMutation(createCourseOptions())
  const duplicate = useMutation(duplicateCourseOptions())
  // One key per dialog session: a retry after a lost answer replays the same copy.
  const [key, setKey] = useState(() => crypto.randomUUID())
  const form = useAppForm(schema, {
    defaultValues,
    onSubmit: ({ name, about, source }) =>
      source
        ? duplicate.mutateAsync(
            { path: { course_id: source }, body: { name }, headers: { 'Idempotency-Key': key } },
            { onSuccess: onCreated },
          )
        : create.mutateAsync({ body: { name, about } }, { onSuccess: onCreated }),
  })
  const reset = () => {
    form.reset()
    create.reset()
    duplicate.reset()
    setKey(crypto.randomUUID())
  }
  return { form, reset, pending: create.isPending || duplicate.isPending, error: create.error ?? duplicate.error }
}

export type CreateCourseFormApi = ReturnType<typeof useCreateForm>['form']

/** "New course": a name and a short description, or a copy of another course; then its workspace (DESIGN 8). */
export function CreateCourseDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { form, reset, pending, error } = useCreateForm(async course => {
    setOpen(false)
    toast.add({ title: m.studio_course_created() })
    await navigate({ to: '/teach/courses/$courseId/overview', params: { courseId: course.id } })
  })
  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      trigger={<Button>{m.studio_new_course()}</Button>}
      title={m.studio_new_course()}
      submitLabel={m.studio_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={pending}
      error={error}
    >
      <form.AppField name="name">{field => <field.TextField label={m.studio_field_name()} required />}</form.AppField>
      <Suspense fallback={<Spinner />}>
        <SourceField form={form} />
      </Suspense>
      <form.Subscribe selector={state => state.values.source}>
        {source =>
          source ? null : (
            <form.AppField name="about">
              {field => <field.TextareaField label={m.studio_field_about()} />}
            </form.AppField>
          )
        }
      </form.Subscribe>
    </FormDialog>
  )
}
