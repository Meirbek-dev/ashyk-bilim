import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'

import type { CommitFormApi } from './use-commit-form'

type PolicyFieldsProps = { form: CommitFormApi; questions: number; leveling: boolean }

/** Attempts, minutes, questions per attempt «из N», passing score, partial credit: row 1 of the file, editable. */
export function PolicyFields({ form, questions, leveling }: PolicyFieldsProps) {
  const total = formatNumber(questions)
  return (
    <div className="grid gap-4 @2xl:grid-cols-2">
      <form.AppField name="max_attempts">
        {field => (
          <field.TextField
            label={m.assessment_import_field_attempts()}
            description={m.assessment_import_attempts_hint()}
            inputMode="numeric"
          />
        )}
      </form.AppField>
      <form.AppField name="time_limit_minutes">
        {field => (
          <field.TextField
            label={m.assessment_import_field_minutes()}
            description={m.assessment_import_minutes_hint()}
            inputMode="numeric"
          />
        )}
      </form.AppField>
      <form.AppField name="draw_count">
        {field => (
          <field.TextField
            label={m.assessment_import_field_draw()}
            description={leveling ? m.assessment_import_draw_levels_hint() : m.assessment_import_draw_hint({ total })}
            suffix={m.assessment_import_draw_of({ total })}
            inputMode="numeric"
          />
        )}
      </form.AppField>
      <form.AppField name="passing_score">
        {field => <field.TextField label={m.assessment_import_field_passing()} inputMode="decimal" />}
      </form.AppField>
      <form.AppField name="partial_credit">
        {field => (
          <field.SwitchField
            label={m.assessment_import_field_partial()}
            description={m.assessment_import_partial_hint()}
          />
        )}
      </form.AppField>
    </div>
  )
}
