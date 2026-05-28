'use server'

/**
 * Client-side assessment API functions for the new unified endpoints.
 *
 * These wrap the canonical /assessments/{uuid}/... REST routes introduced
 * in the World-Class LMS plan Phases 1–5.
 */

import { apiFetch, getResponseMetadata } from '@/lib/api-client'
import { revalidateTag } from 'next/cache'

// ── Shared types ──────────────────────────────────────────────────────────────

export interface AttemptProjection {
  assessment_uuid: string
  submission_uuid: string | null
  submission_status: string | null
  release_state: string | null

  // Action flags
  can_edit: boolean
  can_save_draft: boolean
  can_submit: boolean
  can_start: boolean
  can_continue: boolean
  can_view_result: boolean
  can_start_revision: boolean
  is_returned_for_revision: boolean
  is_result_visible: boolean

  // Recommended action for primary button
  recommended_action:
    | 'start'
    | 'continueDraft'
    | 'submit'
    | 'waitForRelease'
    | 'viewResult'
    | 'startRevision'
    | 'noAction'
    | 'blocked'
  primary_button_label_key: string

  // Score
  score: { raw: number; percentage: number; passed: boolean } | null

  // Reasons why actions are blocked
  disabled_action_reasons: string[]

  // Policy view
  effective_policy: Record<string, unknown> | null

  // Server timestamps (authoritative, use instead of client clock)
  server_now: string | null
  started_at: string | null
  timer_started_at: string | null
  timer_expires_at: string | null
  available_at: string | null
  closes_at: string | null
  due_at: string | null
  time_remaining_seconds: number | null

  // Versioning
  content_version: number
  policy_version: number
}

export interface PolicyPreset {
  kind: string
  grade_release_mode: string
  grading_mode: string
  completion_rule: string
  passing_score: number
  max_attempts: number | null
  time_limit_seconds: number | null
  allow_late: boolean
  anti_cheat_enabled: boolean
  review_visibility: string
}

export interface StudentPolicyOverride {
  id: number
  user_id: number
  policy_id: number
  max_attempts_override: number | null
  due_at_override: string | null
  time_limit_override_seconds: number | null
  waive_late_penalty: boolean
  note: string
  expires_at: string | null
  granted_by: number | null
}

export interface StudentPolicyOverrideCreate {
  user_id: number
  max_attempts_override?: number | null
  due_at_override?: string | null
  waive_late_penalty?: boolean
  note?: string
  expires_at?: string | null
}

export interface StudentPolicyOverrideUpdate {
  max_attempts_override?: number | null
  due_at_override?: string | null
  waive_late_penalty?: boolean
  note?: string
  expires_at?: string | null
}

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
  item_grades: ItemGradeEntry[]
  overall_feedback?: string | null
  status?: 'save' | 'publish' | 'return' | null
  override_score?: boolean
  final_score?: number | null
  override_reason?: string | null
}

export interface CodeRunTestResult {
  test_id: string
  passed: boolean
  stdin?: string | null
  expected?: string | null
  actual?: string | null
  is_visible: boolean
  time?: number | null
  memory?: number | null
}

export interface CodeRunResponse {
  run_id: string
  status: string
  passed?: number | null
  total?: number | null
  score?: number | null
  stdout?: string | null
  stderr?: string | null
  compile_output?: string | null
  time?: number | null
  memory?: number | null
  error_message?: string | null
  is_retryable?: boolean
  visible_results?: CodeRunTestResult[]
}

export interface CodeRunRequest {
  source: string
  language: number
  custom_input?: string | null
  idempotency_key?: string | null
}

// ── Attempt state ─────────────────────────────────────────────────────────────

/**
 * Fetch the authoritative attempt state for the current user.
 * Drive all student action gating from this single call.
 */
export async function getAttemptState(assessmentUuid: string): Promise<AttemptProjection | null> {
  const res = await apiFetch(`assessments/${assessmentUuid}/attempt-state`, {
    method: 'GET',
    next: { tags: ['attempt-state', `assessment-${assessmentUuid}`] },
  })
  const meta = await getResponseMetadata(res)
  if (!meta.success) return null
  return meta.data as AttemptProjection
}

// ── Policy preset ─────────────────────────────────────────────────────────────

export async function getPolicyPreset(kind: string): Promise<PolicyPreset | null> {
  const res = await apiFetch(`assessments/policy-preset/${encodeURIComponent(kind)}`, {
    method: 'GET',
    next: { tags: ['policy-presets'] },
  })
  const meta = await getResponseMetadata(res)
  if (!meta.success) return null
  return meta.data as PolicyPreset
}

// ── Student policy overrides ───────────────────────────────────────────────────

export async function listStudentPolicyOverrides(
  assessmentUuid: string,
): Promise<StudentPolicyOverride[]> {
  const res = await apiFetch(`assessments/${assessmentUuid}/overrides`, {
    method: 'GET',
    next: { tags: ['overrides', `assessment-${assessmentUuid}`] },
  })
  const meta = await getResponseMetadata(res)
  if (!meta.success) return []
  return meta.data as StudentPolicyOverride[]
}

export async function createStudentPolicyOverride(
  assessmentUuid: string,
  payload: StudentPolicyOverrideCreate,
): Promise<StudentPolicyOverride> {
  const res = await apiFetch(`assessments/${assessmentUuid}/overrides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const meta = await getResponseMetadata(res)
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to create override')
  revalidateTag('overrides', 'max')
  return meta.data as StudentPolicyOverride
}

export async function updateStudentPolicyOverride(
  assessmentUuid: string,
  userId: number,
  payload: StudentPolicyOverrideUpdate,
): Promise<StudentPolicyOverride> {
  const res = await apiFetch(`assessments/${assessmentUuid}/overrides/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const meta = await getResponseMetadata(res)
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to update override')
  revalidateTag('overrides', 'max')
  return meta.data as StudentPolicyOverride
}

export async function deleteStudentPolicyOverride(
  assessmentUuid: string,
  userId: number,
): Promise<void> {
  const res = await apiFetch(`assessments/${assessmentUuid}/overrides/${userId}`, {
    method: 'DELETE',
  })
  const meta = await getResponseMetadata(res)
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to delete override')
  revalidateTag('overrides', 'max')
}

// ── Item-level grading ────────────────────────────────────────────────────────

export async function saveGradingDraft(
  assessmentUuid: string,
  submissionUuid: string,
  payload: GradingDraftSave,
  /** Optimistic-concurrency version from the last-fetched submission */
  version?: number,
): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (version !== undefined) {
    headers['If-Match'] = String(version)
  }
  const res = await apiFetch(`assessments/${assessmentUuid}/submissions/${submissionUuid}/grade`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  })

  if (res.status === 412) {
    const { StaleGradeError } = await import('@/services/grading/errors')
    const latest = await import('@/services/grading/grading').then(m =>
      m.getAssessmentSubmission(assessmentUuid, submissionUuid),
    )
    throw new StaleGradeError(latest ?? ({ submission_uuid: submissionUuid } as never))
  }

  const meta = await getResponseMetadata(res)
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to save grading draft')
  revalidateTag('submissions', 'max')
  return meta.data
}

// ── Code challenge runtime ─────────────────────────────────────────────────────

/**
 * Run student code against visible test cases.
 * Does NOT affect the final grade — stored in draft metadata only.
 */
export async function runCodeItem(
  assessmentUuid: string,
  itemUuid: string,
  payload: CodeRunRequest,
): Promise<CodeRunResponse> {
  const res = await apiFetch(`assessments/${assessmentUuid}/items/${itemUuid}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const meta = await getResponseMetadata(res)
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to run code')
  return meta.data as CodeRunResponse
}
