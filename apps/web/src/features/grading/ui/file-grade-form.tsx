import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Attempt, FileGradeRequest, FileRubric, GradeAction } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'

import { fileGradeForm, fileGradeRequest, fileGradeSchema } from '../model/grade-form'
import { itemsPercent, parseScoreInput } from '../model/scoring'
import { gradeAttemptOptions, type ReviewIds } from '../mutations'
import { attemptOptions } from '../queries'
import { GradeActions } from './grade-actions'
import { scoreText } from './labels'
import { useGradeSave } from './use-grade-save'

type FileGradeFormProps = { ids: ReviewIds; attempt: Attempt; rubric: FileRubric }

/** Rubric points, the grade (before the late penalty) and the feedback, then the actions (B-GRD-14..16). */
export function FileGradeForm({ ids, attempt, rubric }: FileGradeFormProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation(gradeAttemptOptions(queryClient, ids))
  const [initial] = useState(() => fileGradeForm(attempt, rubric))
  const action = useRef<GradeAction>('save')
  const grade = useGradeSave(
    (body: FileGradeRequest, version) =>
      mutation.mutateAsync({ path: { attempt_id: attempt.id }, body, headers: { 'If-Match': version } }),
    async () => (await queryClient.fetchQuery({ ...attemptOptions(attempt.id), staleTime: 0 })).version,
    attempt.version,
  )
  const form = useAppForm(fileGradeSchema, {
    defaultValues: initial,
    onSubmit: values => grade.save(fileGradeRequest(values, action.current)),
  })
  const submit = (chosen: GradeAction) => {
    action.current = chosen
    void form.handleSubmit()
  }
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={event => event.preventDefault()}>
      {initial.criteria.length > 0 ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-xl font-semibold">{m.grading_rubric()}</legend>
          {initial.criteria.map((criterion, index) => (
            <form.AppField key={criterion.criterion_id} name={`criteria[${index}].score`}>
              {field => (
                <field.TextField
                  label={m.grading_criterion_score({ label: criterion.label, max: criterion.max })}
                  inputMode="decimal"
                />
              )}
            </form.AppField>
          ))}
          <form.Subscribe selector={state => state.values.criteria}>
            {rows => (
              <p className="text-sm text-muted-foreground tabular-nums">
                {m.grading_rubric_total({
                  percent: scoreText(
                    itemsPercent(rows.map(row => ({ score: parseScoreInput(row.score, row.max) ?? 0, max: row.max }))),
                  ),
                })}
              </p>
            )}
          </form.Subscribe>
        </fieldset>
      ) : null}
      <form.AppField name="final_score">
        {field => <field.TextField label={m.grading_final_score()} inputMode="decimal" />}
      </form.AppField>
      <form.AppField name="feedback">{field => <field.TextareaField label={m.grading_feedback()} />}</form.AppField>
      <GradeActions
        allowed={attempt.allowed_actions}
        pending={grade.pending}
        onAction={submit}
        error={mutation.error}
      />
      <ConflictDialog {...grade.dialog} />
    </form>
  )
}
