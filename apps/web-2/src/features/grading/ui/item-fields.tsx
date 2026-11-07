import { m } from '#/paraglide/messages'

import { SCORE_LINE } from './field-look'
import { ItemComment } from './item-comment'
import type { useAssessmentGrade } from './use-assessment-grade'

type ItemFieldsProps = { form: ReturnType<typeof useAssessmentGrade>['form']; index: number; max: number }

/** One question's score on the marking line, and its comment behind a button until wanted. */
export function ItemFields({ form, index, max }: ItemFieldsProps) {
  return (
    <>
      <div className={SCORE_LINE}>
        <form.AppField name={`items[${index}].score`}>
          {field => <field.TextField label={m.grading_item_score({ max })} inputMode="decimal" />}
        </form.AppField>
      </div>
      <form.Subscribe selector={state => Boolean(state.values.items[index]?.feedback?.trim())}>
        {hasText => (
          <ItemComment hasText={hasText}>
            <form.AppField name={`items[${index}].feedback`}>
              {field => <field.TextareaField label={m.grading_item_feedback()} />}
            </form.AppField>
          </ItemComment>
        )}
      </form.Subscribe>
    </>
  )
}
