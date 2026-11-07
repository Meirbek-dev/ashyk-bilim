import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import type { AssessmentItem, GradeAction, GradeRequest, TeacherSubmission } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'

import { gradeForm, gradeFormSchema, gradeRequest, unscoredManual } from '../model/grade-form'
import { type ReviewIds, saveGradeOptions } from '../mutations'
import { reviewOptions } from '../queries'
import { useFeedbackDraft } from './feedback-draft'
import { useAdvance } from './review-nav'
import { useGradeSave } from './use-grade-save'

/**
 * The state of the grading form of an assessment: the form over the work's last saved grade, the save with its
 * conflict dialog, and the publish check that names answers still unscored.
 */
export function useAssessmentGrade(ids: ReviewIds, submission: TeacherSubmission, items: readonly AssessmentItem[]) {
  const queryClient = useQueryClient()
  const mutation = useMutation(saveGradeOptions(queryClient, ids))
  const [initial] = useState(() => gradeForm(submission, items))
  const action = useRef<GradeAction>('save')
  const advance = useAdvance(ids.work)
  const graded = new Map((submission.grading.items ?? []).map(item => [item.item_id, item]))
  const grade = useGradeSave(
    (body: GradeRequest, version) =>
      mutation.mutateAsync({ path: { submission_id: submission.id }, body, headers: { 'If-Match': version } }),
    async () => (await queryClient.query({ ...reviewOptions(submission.id), staleTime: 0 })).version,
    submission.version,
    advance,
  )
  const form = useAppForm(gradeFormSchema, {
    defaultValues: initial,
    leaveGuard: true,
    onSubmit: values => grade.save(gradeRequest(values, gradeForm(submission, items), action.current)),
  })
  useFeedbackDraft(update => form.setFieldValue('feedback', current => update(current ?? '')))
  const [unscored, setUnscored] = useState<number[]>([])
  const submit = (chosen: GradeAction) => {
    const missing = chosen === 'publish' ? unscoredManual(form.state.values, submission) : []
    setUnscored(missing)
    if (missing.length > 0) return
    action.current = chosen
    void form.handleSubmit()
  }
  return { form, grade, mutation, graded, unscored, submit }
}
