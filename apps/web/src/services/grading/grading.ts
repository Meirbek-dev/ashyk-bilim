'use server'

import type { BulkPublishGradesResponse, Submission, TeacherGradeInput } from '@/types/grading'
import { apiBody, apiJson } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'
import { ifMatchHeaders } from '@/lib/api/headers'
import { teacherSubmissionFromWire } from '@/features/grading/domain/wire'
import { revalidateTag } from 'next/cache'
import { StaleGradeError } from './errors'

const GRADE_ACTION_FROM_STATUS = { GRADED: 'save', PUBLISHED: 'publish', RETURNED: 'return' } as const

/**
 * Fetches the grader's view of one submission (answers, breakdown, versions,
 * feedback). `assessmentUuid` is kept for callers' query keys / stale-grade
 * recovery; the v2 route is scoped by submission id only.
 */
export async function getAssessmentSubmission(
  assessmentUuid: string,
  submissionUuid: string,
): Promise<Submission | null> {
  try {
    const response = await apiJson(`submissions/${submissionUuid}/review`, {
      next: { tags: ['submissions', `assessment-${assessmentUuid}`] },
    })
    return teacherSubmissionFromWire(response)
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...ifMatchHeaders(version) }
  const body = {
    action: GRADE_ACTION_FROM_STATUS[gradeInput.status],
    ...(gradeInput.feedback !== undefined ? { feedback: gradeInput.feedback } : {}),
    ...(gradeInput.final_score !== undefined ? { final_score: gradeInput.final_score } : {}),
    ...(gradeInput.item_grades ? { item_grades: gradeInput.item_grades } : {}),
  }

  try {
    const response = await apiJson(`submissions/${submissionUuid}/grade`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })

    revalidateTag('submissions', 'max')
    return teacherSubmissionFromWire(response)
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

/**
 * The server's per-assessment CSV (UTF-8 + BOM, header and status words in `locale` — UX-105).
 * Returned as bytes: `Response.text()` strips the BOM (UX-113).
 */
export async function exportGradesCSV(assessmentUuid: string, locale: string): Promise<Blob> {
  return apiBody<Blob, 'blob'>(`assessments/${assessmentUuid}/submissions/export`, {
    responseType: 'blob',
    headers: { 'Accept-Language': locale },
  })
}
