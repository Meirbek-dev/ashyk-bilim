import { useMutation } from '@tanstack/react-query'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { ConceptView, CourseId } from '#/shared/api/gen/types.gen'
import { vCreateConceptRequest } from '#/shared/api/gen/valibot.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { updateOptions } from '../queries'

// Both fields are sent on save: the create schema's rules (a name is required here, unlike a PATCH's optional one).
const vConceptFields = v.required(vCreateConceptRequest)

/** Rename and describe a concept (B-CON-06): `updateConcept` with both fields, «Saved» after. */
export function ConceptForm({ courseId, concept }: { courseId: CourseId; concept: ConceptView }) {
  const update = useMutation(updateOptions(courseId))
  const form = useAppForm(vConceptFields, {
    defaultValues: { name: concept.name, description: concept.description },
    leaveGuard: true,
    onSubmit: body =>
      update.mutateAsync(
        { path: { course_id: courseId, concept_id: concept.id }, body },
        { onSuccess: () => toast.add({ title: m.concepts_saved() }) },
      ),
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="name">{field => <field.TextField label={m.concepts_field_name()} required />}</form.AppField>
      <form.AppField name="description">
        {field => <field.TextareaField label={m.concepts_field_description()} />}
      </form.AppField>
      {update.error ? <ErrorAlert>{presentError(update.error)}</ErrorAlert> : null}
      <div>
        <SubmitButton type="submit" variant="outline" pending={update.isPending}>
          {m.concepts_save()}
        </SubmitButton>
      </div>
    </form>
  )
}
