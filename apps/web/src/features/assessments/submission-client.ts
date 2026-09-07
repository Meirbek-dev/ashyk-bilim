import { apiJson } from '@/lib/api-client'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { AssessmentId, SubmissionId, StudentSubmission, SaveDraftRequest, SubmitRequest } from '@/lib/api/generated/zod'
import { ifMatchHeaders, idempotencyHeaders } from '@/lib/api/headers'
import { answersToWire, submissionFromWire } from './domain/submission-wire'
import type { AssessmentSubmissionRead } from './domain/submission-wire'
import type { ItemAnswer } from './domain/items'

export async function getAssessmentDraft(assessmentId: string): Promise<AssessmentSubmissionRead | null> {
  try {
    return await apiJson(
      `assessments/${AssessmentId.parse(assessmentId)}/submissions/draft`,
      undefined,
      submissionFromWire,
    )
  } catch (error) {
    if (hasErrorCode(error, 'not-found')) return null
    throw error
  }
}

export function getMyAssessmentSubmissions(assessmentId: string) {
  return apiJson(`assessments/${AssessmentId.parse(assessmentId)}/submissions/me`, undefined, value =>
    StudentSubmission.array().parse(value).map(submissionFromWire),
  )
}

export function getMySubmission(submissionId: string) {
  return apiJson(`submissions/${SubmissionId.parse(submissionId)}`, undefined, submissionFromWire)
}

export function startAssessmentSubmission(assessmentId: string) {
  return apiJson(`assessments/${AssessmentId.parse(assessmentId)}/submissions`, { method: 'POST' }, submissionFromWire)
}

export function saveAssessmentDraft(submissionId: string, version: number, answers: Record<string, ItemAnswer>) {
  return apiJson(
    `submissions/${SubmissionId.parse(submissionId)}/draft`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...ifMatchHeaders(version) },
      body: JSON.stringify(SaveDraftRequest.parse({ answers: answersToWire(answers) })),
    },
    submissionFromWire,
  )
}

export function submitAssessmentDraft(
  submissionId: string,
  version: number,
  answers: Record<string, ItemAnswer>,
  idempotencyKey: string,
  violationCount?: number,
) {
  return apiJson(
    `submissions/${SubmissionId.parse(submissionId)}/submit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...ifMatchHeaders(version),
        ...idempotencyHeaders(idempotencyKey),
      },
      body: JSON.stringify(SubmitRequest.parse({ answers: answersToWire(answers), violation_count: violationCount })),
    },
    submissionFromWire,
  )
}
