import { m } from '#/paraglide/messages'
import type { AssessmentItem, TeacherSubmission } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'

import { transferToGradeForm } from '../model/ai-draft'
import { typedItemsPercent } from '../model/scoring'
import type { ReviewIds } from '../mutations'
import { AiDraft } from './ai-draft'
import { GRADE_LINE, SCORE_LINE } from './field-look'
import { GradeActions } from './grade-actions'
import { ItemCard } from './item-card'
import { scoreText } from './labels'
import { useAssessmentGrade } from './use-assessment-grade'

type AssessmentGradeFormProps = { ids: ReviewIds; submission: TeacherSubmission; items: readonly AssessmentItem[] }

/**
 * Item scores and comments beside each answer, the override and the feedback, then the actions (B-GRD-12..15); above
 * them the work's AI draft, which can fill the form (B-GRD-43, B-GRD-44). The diff base of a save is the work as last
 * saved (the cache holds every answer), so only what changed since goes out. Publishing with an answer awaiting manual
 * review still unscored says which, before the server's bare 409.
 */
export function AssessmentGradeForm({ ids, submission, items }: AssessmentGradeFormProps) {
  const { form, grade, mutation, graded, unscored, submit } = useAssessmentGrade(ids, submission, items)
  return (
    <form noValidate className="flex flex-col" onSubmit={event => event.preventDefault()}>
      <AiDraft
        ids={ids}
        onTransfer={draft => {
          const next = transferToGradeForm(draft, form.state.values)
          form.setFieldValue('items', next.items)
          form.setFieldValue('feedback', next.feedback)
        }}
      />
      <ol className="flex flex-col">
        {items.map((item, index) => (
          <ItemCard key={item.id} item={item} answer={submission.answers[item.id]} graded={graded.get(item.id)}>
            <div className={SCORE_LINE}>
              <form.AppField name={`items[${index}].score`}>
                {field => <field.TextField label={m.grading_item_score({ max: item.max_score })} inputMode="decimal" />}
              </form.AppField>
            </div>
            {/* Most questions get no comment: the box grows with what is typed, a tall one per question only lengthened the page. */}
            <div className="[&_textarea]:field-sizing-content [&_textarea]:min-h-10">
              <form.AppField name={`items[${index}].feedback`}>
                {field => <field.TextareaField label={m.grading_item_feedback()} />}
              </form.AppField>
            </div>
          </ItemCard>
        ))}
      </ol>
      {/* The whole work: what the learner reads on the left, the grade on the right, under the column of scores. */}
      <div className="grid gap-x-10 gap-y-4 py-8 @3xl/review:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="[&_textarea]:min-h-32">
          <form.AppField name="feedback">{field => <field.TextareaField label={m.grading_feedback()} />}</form.AppField>
        </div>
        <div className={`${GRADE_LINE} @3xl/review:order-last`}>
          <form.AppField name="final_score">
            {field => <field.TextField label={m.grading_override()} inputMode="decimal" />}
          </form.AppField>
        </div>
      </div>
      {unscored.length > 0 ? (
        <ErrorAlert>{m.grading_manual_unscored({ numbers: unscored.join(', ') })}</ErrorAlert>
      ) : null}
      {/* The next step stays in sight down a long work; on a phone it closes the page (three rows would fill the screen). */}
      <div className="-mx-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t bg-background px-4 py-3 @3xl/review:sticky @3xl/review:bottom-0 @3xl/review:z-10 @3xl:-mx-8 @3xl:px-8">
        <form.Subscribe selector={state => state.values.items}>
          {rows => (
            <p className="font-heading text-lg tabular-nums">
              {m.grading_items_total({ percent: scoreText(typedItemsPercent(rows)) })}
            </p>
          )}
        </form.Subscribe>
        <GradeActions
          allowed={submission.allowed_actions}
          published={submission.status === 'published'}
          pending={grade.pending}
          onAction={submit}
          error={mutation.error}
          layout="bar"
        />
      </div>
      <ConflictDialog {...grade.dialog} />
    </form>
  )
}
