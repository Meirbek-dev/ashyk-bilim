import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Chapter } from '#/shared/api/gen/types.gen'
import { activityTypeMeta } from '#/shared/i18n/labels'
import { IconButton } from '#/shared/ui/icon-button'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { FormDialog } from '#/shared/ui/templates/form-dialog'

import { createActivityOptions, createAssessmentOptions, createFileSubmissionOptions } from '../curriculum-queries'
import { CREATABLE_TYPES, createPlan, newActivitySchema, type NewActivity } from '../model/studio'

const defaultValues: NewActivity = { name: '', type: 'dynamic', source: 'youtube' }
const typeOptions = CREATABLE_TYPES.map(type => ({ value: type, label: activityTypeMeta[type].label() }))

/**
 * "Add activity": one dialog for every type. Quiz, exam and code go through the assessment door, file submission
 * through its config, the rest through the activity door; then the new activity's studio opens.
 */
export function CreateActivityDialog({ courseId, chapter }: { courseId: string; chapter: Chapter }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const activity = useMutation(createActivityOptions(useQueryClient(), courseId))
  const assessment = useMutation(createAssessmentOptions(courseId))
  const fileSubmission = useMutation(createFileSubmissionOptions(courseId))
  const doors = [activity, assessment, fileSubmission]

  async function create({ name, type, source }: NewActivity): Promise<string> {
    const plan = createPlan(type, source)
    if (plan.door === 'assessment') {
      const body = { chapter_id: chapter.id, kind: plan.kind, title: name }
      return (await assessment.mutateAsync({ body })).activity_id
    }
    if (plan.door === 'file-submission') {
      return (await fileSubmission.mutateAsync({ body: { chapter_id: chapter.id, title: name } })).activity_id
    }
    const { door: _, ...pair } = plan
    return (await activity.mutateAsync({ path: { chapter_id: chapter.id }, body: { name, ...pair } })).id
  }
  const form = useAppForm(newActivitySchema, {
    defaultValues,
    onSubmit: async value => {
      const activityId = await create(value)
      changeOpen(false)
      toast(m.studio_activity_created())
      await navigate({ to: '/teach/courses/$courseId/activities/$activityId/edit', params: { courseId, activityId } })
    },
  })
  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      form.reset()
      for (const door of doors) door.reset()
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      trigger={<IconButton label={m.studio_activity_new_in({ name: chapter.name })} icon={<Plus aria-hidden />} />}
      title={m.studio_activity_new()}
      submitLabel={m.studio_create_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={doors.some(door => door.isPending)}
      error={doors.find(door => door.error)?.error ?? null}
    >
      <form.AppField name="type">
        {field => <field.RadioGroupField label={m.studio_field_type()} options={typeOptions} />}
      </form.AppField>
      <form.Subscribe selector={state => state.values.type}>
        {type =>
          type === 'video' ? (
            <form.AppField name="source">
              {field => (
                <field.RadioGroupField
                  label={m.studio_field_video_source()}
                  options={[
                    { value: 'youtube', label: m.studio_video_youtube() },
                    { value: 'file', label: m.studio_video_file() },
                  ]}
                />
              )}
            </form.AppField>
          ) : null
        }
      </form.Subscribe>
      <form.AppField name="name">{field => <field.TextField label={m.studio_field_name()} required />}</form.AppField>
    </FormDialog>
  )
}
