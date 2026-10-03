import { m } from '#/paraglide/messages'

import { lateLabels, optionsOf } from './labels'
import type { PolicyFormApi } from './use-policy-form'

/** Attempts, time limit, the deadline and what happens after it (platform-zone dates). */
export function TimingFields({ form }: { form: PolicyFormApi }) {
  return (
    <>
      <form.AppField name="max_attempts">
        {field => (
          <field.TextField
            label={m.assessments_field_attempts()}
            description={m.assessments_field_attempts_hint()}
            inputMode="numeric"
          />
        )}
      </form.AppField>
      <form.AppField name="time_limit_minutes">
        {field => (
          <field.TextField
            label={m.assessments_field_time_limit()}
            description={m.assessments_field_time_limit_hint()}
            inputMode="decimal"
          />
        )}
      </form.AppField>
      <form.AppField name="due_at">
        {field => (
          <field.TextField
            label={m.assessments_field_due()}
            description={m.assessments_field_due_hint()}
            type="datetime-local"
          />
        )}
      </form.AppField>
      <form.AppField name="allow_late">
        {field => <field.SwitchField label={m.assessments_field_allow_late()} />}
      </form.AppField>
      <form.AppField name="late_kind">
        {field => <field.SelectField label={m.assessments_field_late_kind()} options={optionsOf(lateLabels)} />}
      </form.AppField>
      <form.Subscribe selector={state => state.values.late_kind}>
        {kind => (
          <>
            {kind === 'penalty' ? (
              <>
                <form.AppField name="percent_per_day">
                  {field => <field.TextField label={m.assessments_field_percent_per_day()} inputMode="decimal" />}
                </form.AppField>
                <form.AppField name="max_days">
                  {field => <field.TextField label={m.assessments_field_max_days()} inputMode="numeric" />}
                </form.AppField>
              </>
            ) : null}
            {kind === 'cutoff' ? (
              <form.AppField name="cutoff_at">
                {field => <field.TextField label={m.assessments_field_cutoff()} type="datetime-local" />}
              </form.AppField>
            ) : null}
          </>
        )}
      </form.Subscribe>
      <form.AppField name="grace_period_minutes">
        {field => (
          <field.TextField
            label={m.assessments_field_grace()}
            description={m.assessments_field_grace_hint()}
            inputMode="numeric"
          />
        )}
      </form.AppField>
    </>
  )
}
