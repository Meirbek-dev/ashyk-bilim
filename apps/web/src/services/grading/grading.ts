'use server'

import type { BulkPublishGradesResponse, Submission, TeacherGradeInput } from '@/types/grading'
import { apiFetch, apiJson, getResponseMetadata } from '@/lib/api-client'
import { parseApiError } from '@/lib/api/assertSuccess'
import { revalidateTag } from 'next/cache'
import { StaleGradeError } from './errors'

// ── Student endpoints ─────────────────────────────────────────────────────────

// ── Teacher endpoints ─────────────────────────────────────────────────────────

export async function getAssessmentSubmission(
  assessmentUuid: string,
  submissionUuid: string,
): Promise<Submission | null> {
  const res = await apiFetch(`assessments/${assessmentUuid}/submissions/${submissionUuid}`, {
    next: { tags: ['submissions'] },
  })
  const meta = await getResponseMetadata(res)
  if (!meta.success) return null
  return meta.data as Submission
}

export async function saveGrade(
  submissionUuid: string,
  gradeInput: TeacherGradeInput,
  /** Optimistic-concurrency version from the last-fetched submission. */
  version: number | undefined,
  assessmentUuid: string,
): Promise<Submission> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (version !== undefined) {
    headers['If-Match'] = String(version)
  }
  const endpoint = `assessments/${assessmentUuid}/submissions/${submissionUuid}`
  const res = await apiFetch(endpoint, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(gradeInput),
  })

  if (res.status === 412) {
    // Server has a newer version — retrieve it and throw a typed error so the
    // UI can show a merge banner instead of a generic toast.
    const latest = await getAssessmentSubmission(assessmentUuid, submissionUuid)
    throw new StaleGradeError(latest ?? ({ submission_uuid: submissionUuid } as Submission))
  }

  if (!res.ok) throw await parseApiError(res, endpoint)

  revalidateTag('submissions', 'max')
  return (await res.json()) as Submission
}

export async function publishAssessmentGrades(assessmentUuid: string): Promise<BulkPublishGradesResponse> {
  const response = await apiJson<BulkPublishGradesResponse>(`assessments/${assessmentUuid}/publish-grades`, {
    method: 'POST',
  })

  revalidateTag('submissions', 'max')
  return response
}

export async function exportGradesCSV(assessmentUuid: string): Promise<string> {
  const res = await apiFetch(`assessments/${assessmentUuid}/submissions/export`)
  if (!res.ok) throw await parseApiError(res, `assessments/${assessmentUuid}/submissions/export`)
  return res.text()
}
