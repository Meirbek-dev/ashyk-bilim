import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradeAction, GradeRequest, TeacherSubmission } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'

import { gradeForm, gradeFormSchema, gradeRequest } from '../model/grade-form'
import { itemsPercent, parseScoreInput } from '../model/scoring'
import { type ReviewIds, saveGradeOptions } from '../mutations'
import { reviewOptions } from '../queries'
import { GradeActions } from './grade-actions'
import { ItemCard } from './item-card'
import { scoreText } from './labels'
import { useGradeSave } from './use-grade-save'

type AssessmentGradeFormProps = { ids: ReviewIds; submission: TeacherSubmission; items: readonly AssessmentItem[] }

/** Item scores and comments beside each answer, the override and the feedback, then the actions (B-GRD-12..15). */
export function AssessmentGradeForm({ ids, submission, items }: AssessmentGradeFormProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation(saveGradeOptions(queryClient, ids))
  const [initial] = useState(() => gradeForm(submission, items))
  const action = useRef<GradeAction>('save')
  const graded = new Map((submission.grading.items ?? []).map(item => [item.item_id, item]))
  const grade = useGradeSave(
    (body: GradeRequest, version) =>
      mutation.mutateAsync({ path: { submission_id: submission.id }, body, headers: { 'If-Match': version } }),
    async () => (await queryClient.fetchQuery({ ...reviewOptions(submission.id), staleTime: 0 })).version,
    submission.version,
  )
  // The diff base is the work as last saved (the cache holds every answer), so only what changed since goes out.
  const form = useAppForm(gradeFormSchema, {
    defaultValues: initial,
    onSubmit: values => grade.save(gradeRequest(values, gradeForm(submission, items), action.current)),
  })
  const submit = (chosen: GradeAction) => {
    action.current = chosen
    void form.handleSubmit()
  }
  return (
    <form noValidate className="flex flex-col gap-gutter" onSubmit={event => event.preventDefault()}>
      <ol className="flex flex-col gap-4">
        {items.map((item, index) => (
          <ItemCard key={item.id} item={item} answer={submission.answers[item.id]} graded={graded.get(item.id)}>
            <div className="grid gap-4 @2xl:grid-cols-2">
              <form.AppField name={`items[${index}].score`}>
                {field => <field.TextField label={m.grading_item_score({ max: item.max_score })} inputMode="decimal" />}
              </form.AppField>
              <form.AppField name={`items[${index}].feedback`}>
                {field => <field.TextareaField label={m.grading_item_feedback()} />}
              </form.AppField>
            </div>
          </ItemCard>
        ))}
      </ol>
      <form.Subscribe selector={state => state.values.items}>
        {rows => (
          <p className="text-sm text-muted-foreground tabular-nums">
            {m.grading_items_total({
              percent: scoreText(
                itemsPercent(rows.map(row => ({ score: parseScoreInput(row.score, row.max) ?? 0, max: row.max }))),
              ),
            })}
          </p>
        )}
      </form.Subscribe>
      <form.AppField name="final_score">
        {field => <field.TextField label={m.grading_override()} inputMode="decimal" />}
      </form.AppField>
      <form.AppField name="feedback">{field => <field.TextareaField label={m.grading_feedback()} />}</form.AppField>
      <GradeActions
        allowed={submission.allowed_actions}
        pending={grade.pending}
        onAction={submit}
        error={mutation.error}
      />
      <ConflictDialog {...grade.dialog} />
    </form>
  )
}
