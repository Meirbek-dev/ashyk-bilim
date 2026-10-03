import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactElement } from 'react'

import { m } from '#/paraglide/messages'
import type { StudentOverride, UserSummary } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { toast } from '#/shared/ui/toast'

import { blankOverride, overrideBody, overrideForm, overrideFormSchema, type OverrideForm } from '../model/overrides'
import { createOverrideOptions, updateOverrideOptions } from '../queries'

type OverrideDialogProps = {
  assessmentId: string
  trigger: ReactElement
  /** The exception being changed; none: a new one for a learner picked here. */
  row?: StudentOverride
  /** Learners who can get a new exception (those without one). */
  learners: readonly UserSummary[]
}

/** Adds or changes one learner's exception: attempts, a personal deadline, no late penalty and a note. */
export function OverrideDialog({ assessmentId, trigger, row, learners }: OverrideDialogProps) {
  const queryClient = useQueryClient()
  const create = useMutation(createOverrideOptions(queryClient, assessmentId))
  const update = useMutation(updateOverrideOptions(queryClient, assessmentId))
  const save = row ? update : create
  const [open, setOpen] = useState(false)
  const [defaultValues] = useState<OverrideForm>(() => (row ? overrideForm(row) : blankOverride))
  const form = useAppForm(overrideFormSchema, {
    defaultValues,
    onSubmit: values =>
      save.mutateAsync(
        { path: { assessment_id: assessmentId, user_id: values.user_id }, body: overrideBody(values, row) },
        {
          onSuccess: () => {
            setOpen(false)
            if (!row) form.reset()
            toast.add({ title: m.assessments_exception_saved() })
          },
        },
      ),
  })
  const choices = [
    { value: '', label: m.assessments_learner_pick() },
    ...learners.map(user => ({ value: user.id, label: `${user.display_name} (@${user.username})` })),
  ]
  return (
    <FormDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) save.reset()
      }}
      trigger={trigger}
      title={m.assessments_nav_exceptions()}
      submitLabel={m.ui_save()}
      onSubmit={() => form.handleSubmit()}
      pending={save.isPending}
      error={save.error}
    >
      {row ? null : (
        <form.AppField name="user_id">
          {field => <field.SelectField label={m.assessments_field_learner()} options={choices} />}
        </form.AppField>
      )}
      <form.AppField name="attempts">
        {field => (
          <field.TextField
            label={m.assessments_field_attempts_override()}
            description={m.assessments_field_attempts_override_hint()}
            inputMode="numeric"
          />
        )}
      </form.AppField>
      <form.AppField name="due_at">
        {field => <field.TextField label={m.assessments_field_due_override()} type="datetime-local" />}
      </form.AppField>
      <form.AppField name="waive">{field => <field.SwitchField label={m.assessments_field_waive()} />}</form.AppField>
      <form.AppField name="note">{field => <field.TextareaField label={m.assessments_field_note()} />}</form.AppField>
    </FormDialog>
  )
}
