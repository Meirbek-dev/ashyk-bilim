/**
 * Client-side teacher grade save. A plain function, NOT a server action:
 * `GradeForm` needs the problem+json code and the `StaleGradeError` class of a
 * 412, neither of which survives the server-action boundary (GAUNTLET BUG-035,
 * UX-242).
 */

import { apiJson } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'
import { ifMatchHeaders } from '@/lib/api/headers'
import { teacherSubmissionFromWire } from '@/features/grading/domain/wire'
import type { Submission } from '@/features/grading/domain'

export interface RubricCriterion {
  criterion: string
  score: number
  max_score: number
  comment?: string | null
}

export interface ItemGradeEntry {
  item_uuid: string
  score: number | null
  feedback?: string | null
  is_manual?: boolean
  rubric_criteria?: RubricCriterion[]
}

export interface GradingDraftSave {
  /** Only the items the teacher edited (BUG-174): the server keeps the rest. */
  item_grades: ItemGradeEntry[]
  overall_feedback?: string | null
  status?: 'save' | 'publish' | 'return' | null
  /** A manual override; `null` drops a stored one (the items decide again); omitted keeps it. */
  final_score?: number | null
  override_reason?: string | null
}

// ── Item-level grading ────────────────────────────────────────────────────────

export async function saveGradingDraft(
  assessmentUuid: string,
  submissionUuid: string,
  payload: GradingDraftSave,
  /** Optimistic-concurrency version from the last-fetched submission */
  version?: number,
): Promise<Submission> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...ifMatchHeaders(version) }
  // v2's grade save (`PATCH submissions/{id}/grade`, no assessment prefix) takes
  // `{action, feedback?, final_score?, item_grades?}` (additionalProperties:
  // false) — translate the item-level draft shape onto that wire contract.
  const body = {
    action: payload.status ?? 'save',
    ...(payload.overall_feedback ? { feedback: payload.overall_feedback } : {}),
    ...(payload.final_score === undefined ? {} : { final_score: payload.final_score }),
    item_grades: payload.item_grades.map(item => ({
      item_id: item.item_uuid,
      score: item.score,
      ...(item.feedback ? { feedback: item.feedback } : {}),
    })),
  }
  try {
    const response = await apiJson(`submissions/${submissionUuid}/grade`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })
    return teacherSubmissionFromWire(response)
  } catch (error) {
    if (isApiError(error) && error.status === 412) {
      const { StaleGradeError } = await import('@/services/grading/errors')
      const latest = await import('@/services/grading/grading').then(m =>
        m.getAssessmentSubmission(assessmentUuid, submissionUuid),
      )
      throw new StaleGradeError(latest ?? ({ submission_uuid: submissionUuid } as never))
    }
    throw error
  }
}
