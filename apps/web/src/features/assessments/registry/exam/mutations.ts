'use client'

import { apiJson } from '@/lib/api-client'
import { AssessmentDetail } from '@/lib/api/generated/zod'
import { courseKeys } from '@/hooks/courses/courseKeys'
import { mutationOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { buildExamPolicyPatch } from './policySettings'

export interface CreateExamWithActivityInput {
  activityName: string
  chapterId: string
  examTitle: string
  examDescription: string
  settings: Record<string, unknown>
}

export interface CreateExamWithActivityResponse {
  activity_uuid?: string
  exam_uuid?: string
  [key: string]: unknown
}

const json = (method: 'POST' | 'PUT' | 'PATCH', body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/**
 * v2 creates the activity and the assessment in one `POST assessments`,
 * starting from the kind's policy preset. The modal's settings are then applied
 * as a whole-policy `PUT` merged onto that preset — `Policy` is replaced
 * wholesale, so a partial patch would 422.
 */
async function createExamWithActivityRequest(
  input: CreateExamWithActivityInput,
): Promise<CreateExamWithActivityResponse> {
  const created = await apiJson(
    'assessments',
    json('POST', {
      kind: 'exam',
      chapter_id: input.chapterId,
      title: input.examTitle,
      description: input.examDescription || null,
      grading_type: 'percentage',
    }),
    data => AssessmentDetail.parse(data),
  )

  const { violation_threshold, ...patch } = buildExamPolicyPatch(input.settings)
  await apiJson(
    `assessments/${created.id}/policy`,
    json('PUT', {
      ...created.policy,
      ...patch,
      ...(violation_threshold === null ? {} : { violation_threshold }),
      randomize_questions: input.settings.shuffle_questions === true,
      randomize_options: input.settings.shuffle_answers === true,
      review_visibility: input.settings.allow_result_review === true ? 'full' : 'none',
    }),
  )

  if (input.activityName && input.activityName !== input.examTitle) {
    await apiJson(`activities/${created.activity_id}`, json('PATCH', { name: input.activityName }))
  }

  return { exam_uuid: created.id, activity_uuid: created.activity_id }
}

export function createExamWithActivityMutationOptions(
  queryClient: QueryClient,
  courseUuid?: string | null,
  withUnpublishedActivities = false,
) {
  return mutationOptions({
    mutationFn: (input: CreateExamWithActivityInput) => createExamWithActivityRequest(input),
    onSuccess: async () => {
      if (!courseUuid) return

      await queryClient.invalidateQueries({
        queryKey: courseKeys.structure(courseUuid, withUnpublishedActivities),
      })
    },
  })
}
