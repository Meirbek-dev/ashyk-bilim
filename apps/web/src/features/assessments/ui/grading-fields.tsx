import { m } from '#/paraglide/messages'

import { optionsOf, releaseLabels, reviewLabels } from './labels'
import type { PolicyFormApi } from './use-policy-form'

/** Scoring, order and what the learner gets back. */
export function GradingFields({ form }: { form: PolicyFormApi }) {
  return (
    <>
      <form.AppField name="passing_score">
        {field => <field.TextField label={m.assessments_field_passing()} inputMode="decimal" />}
      </form.AppField>
      <form.AppField name="partial_credit">
        {field => (
          <field.SwitchField label={m.assessments_field_partial()} description={m.assessments_field_partial_hint()} />
        )}
      </form.AppField>
      <form.AppField name="negative_marking_percent">
        {field => <field.TextField label={m.assessments_field_negative()} inputMode="decimal" />}
      </form.AppField>
      <form.AppField name="randomize_questions">
        {field => <field.SwitchField label={m.assessments_field_shuffle_questions()} />}
      </form.AppField>
      <form.AppField name="randomize_options">
        {field => <field.SwitchField label={m.assessments_field_shuffle_options()} />}
      </form.AppField>
      <form.AppField name="grade_release_mode">
        {field => <field.SelectField label={m.assessments_field_release()} options={optionsOf(releaseLabels)} />}
      </form.AppField>
      <form.AppField name="review_visibility">
        {field => <field.SelectField label={m.assessments_field_review()} options={optionsOf(reviewLabels)} />}
      </form.AppField>
      <form.AppField name="required">
        {field => <field.SwitchField label={m.assessments_field_required()} />}
      </form.AppField>
    </>
  )
}
