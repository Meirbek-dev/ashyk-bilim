'use client'

import { apiFetch } from '@/lib/api-client'
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
  const response = await apiFetch('assessments', {
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

  const payload = (await response.json().catch(() => ({}))) as {
    detail?: string
    assessment_uuid?: string
    activity_uuid?: string
  }

  if (!response.ok) {
    throw new Error(payload.detail || 'Failed to create exam')
  }

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
