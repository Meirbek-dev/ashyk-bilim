import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { LockableSection } from '#/features/course-studio'
import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { toast } from '#/shared/ui/toast'

import { detailsBody, detailsForm, detailsFormSchema } from '../model/details'
import { editMode } from '../model/route'
import { updateAssessmentOptions } from '../queries'
import { gradingLabels, lockReason, optionsOf } from './labels'
import { MarkdownField } from './markdown-field'
import { isStale, useVersion } from './use-version'

type DetailsSectionProps = { activityId: string; assessment: AssessmentDetail }

/**
 * "Basics": the description learners read, the weight in the course total and the scale; read-only while locked. An
 * answered live test keeps its description editable, the weight and the scale locked (B-ASM-31).
 */
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
  const mode = editMode(assessment)
  const lock = mode === 'wording' ? null : lockReason(assessment)
  return (
    <>
      <LockableSection
        lock={lock}
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
              editable={mode !== 'none'}
            />
          )}
        </form.AppField>
        {mode === 'wording' ? <p className="text-sm text-muted-foreground">{m.assessments_wording_details()}</p> : null}
        {/* `inert` and the dimmed radios as in LockableSection: the radio group is a Base UI span a disabled fieldset does
            not reach. */}
        <fieldset
          disabled={mode !== 'all'}
          inert={mode !== 'all'}
          className={`flex min-w-0 flex-col gap-4 ${mode === 'all' ? '' : '[&_[role=radio]]:opacity-50'}`}
        >
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
        </fieldset>
      </LockableSection>
      <ConflictDialog
        open={version.conflict}
        onOpenChange={version.setConflict}
        onRetry={() => void version.reload().then(() => form.handleSubmit())}
        pending={update.isPending}
      />
    </>
  )
}
