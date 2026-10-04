import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'

import { deadlinesForm, deadlinesPatch, deadlinesSchema, LATE_KINDS, RELEASE_MODES } from '../model/config'
import { lateKindLabels, releaseLabels } from './labels'
import { useTaskSave } from './use-task-save'

const lateOptions = () => LATE_KINDS.map(kind => ({ value: kind, label: lateKindLabels[kind]() }))
const releaseOptions = () => RELEASE_MODES.map(mode => ({ value: mode, label: releaseLabels[mode]() }))

/**
 * Deadline (a date and time in the platform zone), late work, the attempt cap and the grade release (B-FSB-17). The
 * late rule's own fields show only for the chosen rule.
 */
export function DeadlinesSection({ task }: { task: FileSubmission }) {
  const write = useTaskSave(task)
  const [defaultValues] = useState(() => deadlinesForm(task))
  const form = useAppForm(deadlinesSchema, {
    defaultValues,
    onSubmit: values => write.save(deadlinesPatch(values)),
  })
  return (
    <>
      <SettingsSection
        title={m.submission_deadlines_title()}
        description={m.submission_deadlines_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={write.pending}
        error={write.error}
      >
        <form.AppField name="due_at">
          {field => (
            <field.TextField
              label={m.submission_field_due()}
              description={m.submission_field_due_hint()}
              type="datetime-local"
            />
          )}
        </form.AppField>
        <form.AppField name="allow_late">
          {field => <field.SwitchField label={m.submission_field_allow_late()} />}
        </form.AppField>
        <form.Subscribe selector={state => (state.values.allow_late ? state.values.late_policy.kind : null)}>
          {kind =>
            kind === null ? null : (
              <>
                <form.AppField name="late_policy.kind">
                  {field => <field.RadioGroupField label={m.submission_field_late_policy()} options={lateOptions()} />}
                </form.AppField>
                {kind === 'penalty' ? (
                  <>
                    <form.AppField name="late_policy.percent_per_day">
                      {field => <field.TextField label={m.submission_field_percent()} inputMode="decimal" required />}
                    </form.AppField>
                    <form.AppField name="late_policy.max_days">
                      {field => <field.TextField label={m.submission_field_max_days()} inputMode="numeric" required />}
                    </form.AppField>
                  </>
                ) : null}
                {kind === 'cutoff' ? (
                  <form.AppField name="late_policy.cutoff_at">
                    {field => <field.TextField label={m.submission_field_cutoff()} type="datetime-local" required />}
                  </form.AppField>
                ) : null}
              </>
            )
          }
        </form.Subscribe>
        <form.AppField name="max_attempts">
          {field => (
            <field.TextField
              label={m.submission_field_max_attempts()}
              description={m.submission_blank_no_limit()}
              inputMode="numeric"
            />
          )}
        </form.AppField>
        <form.AppField name="grade_release_mode">
          {field => <field.RadioGroupField label={m.submission_field_release()} options={releaseOptions()} />}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog} />
    </>
  )
}
