import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { detailsBody, detailsForm, detailsFormSchema } from '../model/details'
import { updateAssessmentOptions } from '../queries'
import { gradingLabels, optionsOf } from './labels'
import { MarkdownField } from './markdown-field'
import { isStale, useVersion } from './use-version'

type DetailsSectionProps = { activityId: string; assessment: AssessmentDetail }

/** "Basics": the description learners read, the weight in the course total and the scale. */
export function DetailsSection({ activityId, assessment }: DetailsSectionProps) {
  const update = useMutation(updateAssessmentOptions(useQueryClient(), activityId))
  const version = useVersion(activityId)
  // Captured once: the cache write after saving must not reset what the author typed.
  const [defaultValues] = useState(() => detailsForm(assessment))
  const form = useAppForm(detailsFormSchema, {
    defaultValues,
    onSubmit: values =>
      update.mutateAsync(
        { path: { assessment_id: assessment.id }, body: detailsBody(values), headers: version.headers() },
        { onSuccess: () => toast.add({ title: m.assessments_saved() }), onError: version.onError },
      ),
  })
  return (
    <>
      <SettingsSection
        title={m.assessments_nav_details()}
        description={m.assessments_details_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="description">
          {field => (
            <MarkdownField
              label={m.assessments_field_description()}
              value={field.state.value}
              onChange={field.handleChange}
              editable
            />
          )}
        </form.AppField>
        <form.AppField name="weight">
          {field => (
            <field.TextField
              label={m.assessments_field_weight()}
              description={m.assessments_field_weight_hint()}
              inputMode="decimal"
            />
          )}
        </form.AppField>
        <form.AppField name="grading_type">
          {field => (
            <field.RadioGroupField label={m.assessments_field_grading_type()} options={optionsOf(gradingLabels)} />
          )}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog
        open={version.conflict}
        onOpenChange={version.setConflict}
        onRetry={() => void version.reload().then(() => form.handleSubmit())}
        pending={update.isPending}
      />
    </>
  )
}
