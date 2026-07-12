'use server'

import type { BulkPublishGradesResponse, Submission, TeacherGradeInput } from '@/types/grading'
import { apiBody, apiJson } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'
import { revalidateTag } from 'next/cache'
import { StaleGradeError } from './errors'

export async function getAssessmentSubmission(
  assessmentUuid: string,
  submissionUuid: string,
): Promise<Submission | null> {
  try {
    return await apiJson<Submission>(`assessments/${assessmentUuid}/submissions/${submissionUuid}`, {
      next: { tags: ['submissions'] },
    })
  } catch {
    return null
  }
}

export async function saveGrade(
  submissionUuid: string,
  gradeInput: TeacherGradeInput,
  version: number | undefined,
  assessmentUuid: string,
): Promise<Submission> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (version !== undefined) headers['If-Match'] = String(version)

  const endpoint = `assessments/${assessmentUuid}/submissions/${submissionUuid}`

  try {
    const submission = await apiJson<Submission>(endpoint, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(gradeInput),
    })

    revalidateTag('submissions', 'max')
    return submission
  } catch (error) {
    if (isApiError(error) && error.status === 412) {
      const latest = await getAssessmentSubmission(assessmentUuid, submissionUuid)
      throw new StaleGradeError(latest ?? ({ submission_uuid: submissionUuid } as unknown as Submission))
    }
    throw error
  }
}

export async function publishAssessmentGrades(assessmentUuid: string): Promise<BulkPublishGradesResponse> {
  const response = await apiJson<BulkPublishGradesResponse>(`assessments/${assessmentUuid}/publish-grades`, {
    method: 'POST',
  })

  revalidateTag('submissions', 'max')
  return response
}

export async function exportGradesCSV(assessmentUuid: string): Promise<string> {
  return apiBody<string, 'text'>(`assessments/${assessmentUuid}/submissions/export`, { responseType: 'text' })
}
