'use client'

import { apiJson } from '@/lib/api-client'
import { courseKeys } from '@/hooks/courses/courseKeys'
import { mutationOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { buildExamPolicyPatch } from './policySettings'

export interface CreateExamWithActivityInput {
  activityName: string
  courseId: number
  chapterId: number
  examTitle: string
  examDescription: string
  settings: Record<string, unknown>
}

export interface CreateExamWithActivityResponse {
  activity_uuid?: string
  exam_uuid?: string
  [key: string]: unknown
}

async function createExamWithActivityRequest(
  input: CreateExamWithActivityInput,
): Promise<CreateExamWithActivityResponse> {
  const payload = await apiJson<{
    detail?: string
    assessment_uuid?: string
    activity_uuid?: string
  }>('assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'EXAM',
      title: input.examTitle,
      description: input.examDescription,
      course_id: input.courseId,
      chapter_id: input.chapterId,
      grading_type: 'PERCENTAGE',
      policy: buildExamPolicyPatch(input.settings),
    }),
  })

  return {
    ...payload,
    ...(payload.assessment_uuid === undefined ? {} : { exam_uuid: payload.assessment_uuid }),
    ...(payload.activity_uuid === undefined ? {} : { activity_uuid: payload.activity_uuid }),
  }
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
