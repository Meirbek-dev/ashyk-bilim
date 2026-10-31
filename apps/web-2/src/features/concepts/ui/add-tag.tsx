import { useMutation } from '@tanstack/react-query'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { ConceptId, CourseId } from '#/shared/api/gen/types.gen'
import { vActivityId } from '#/shared/api/gen/valibot.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SubmitButton } from '#/shared/components/submit-button'
import { formatNumber } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { TAG_WEIGHTS, type ActivityInfo } from '../model/graph'
import { createTagOptions } from '../queries'

const vAddTag = v.object({ activity_id: vActivityId, weight: v.picklist(TAG_WEIGHTS.map(String)) })

type AddTagProps = { courseId: CourseId; conceptId: ConceptId; activities: readonly ActivityInfo[] }

/** «Add an activity» (B-CON-08): an activity of the course not yet tagged with the concept, and a weight. */
export function AddTag({ courseId, conceptId, activities }: AddTagProps) {
  const create = useMutation(createTagOptions(courseId))
  const form = useAppForm(vAddTag, {
    defaultValues: { activity_id: activities[0]?.id ?? '', weight: '1' },
    onSubmit: ({ activity_id, weight }) =>
      create.mutateAsync(
        { path: { course_id: courseId }, body: { concept_id: conceptId, activity_id, weight: Number(weight) } },
        {
          onSuccess: () => {
            form.reset()
            toast.add({ title: m.concepts_tag_added() })
          },
        },
      ),
  })
  if (activities.length === 0) return null
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="activity_id">
        {field => (
          <field.SelectField
            label={m.concepts_tag_activity()}
            options={activities.map(activity => ({ value: activity.id, label: activity.name }))}
          />
        )}
      </form.AppField>
      <form.AppField name="weight">
        {field => (
          <field.SelectField
            label={m.concepts_tag_weight_label()}
            description={m.concepts_tag_weight_hint()}
            options={TAG_WEIGHTS.map(weight => ({ value: String(weight), label: formatNumber(weight) }))}
          />
        )}
      </form.AppField>
      {create.error ? <ErrorAlert>{presentError(create.error)}</ErrorAlert> : null}
      <div>
        <SubmitButton type="submit" variant="outline" pending={create.isPending}>
          {m.concepts_tag_add()}
        </SubmitButton>
      </div>
    </form>
  )
}
