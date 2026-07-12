/**
 * Unit tests for the assessments service module.
 *
 * Covers:
 *  - `getAssessmentByUuid` — success, null on 404, null on network error
 *  - `getAssessmentByActivityUuid` — success, null on 404, null on network error
 *  - `getAttemptState` — success, null on failure
 *  - `getPolicyPreset` — success, null on failure
 *  - `listStudentPolicyOverrides` — success, empty array on failure
 *  - `createStudentPolicyOverride` — success, throws on failure
 *  - `updateStudentPolicyOverride` — success, throws on failure
 *  - `deleteStudentPolicyOverride` — success, throws on failure
 *  - `saveGradingDraft` — success, throws StaleGradeError on 412, throws on failure
 *  - `runCodeItem` — success, throws on failure
 */

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { APIError } from '@/lib/api/assertSuccess'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  apiResult: vi.fn(),
  revalidateTag: vi.fn(),
  getAssessmentSubmission: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiJson: mocks.apiJson,
  apiResult: mocks.apiResult,
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}))

vi.mock('@services/config/config', () => ({
  getAPIUrl: vi.fn(() => 'http://api.test/'),
  getServerAPIUrl: vi.fn(() => 'http://api:8000/api/v1/'),
}))

// Import AFTER mocks
import {
  getAttemptState,
  getPolicyPreset,
  listStudentPolicyOverrides,
  createStudentPolicyOverride,
  updateStudentPolicyOverride,
  deleteStudentPolicyOverride,
  saveGradingDraft,
  runCodeItem,
} from '@/services/assessments/assessment-actions'
import { getAssessmentByUuid, getAssessmentByActivityUuid } from '@/services/assessments/assessments'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAssessment(overrides = {}) {
  return {
    id: 1,
    assessment_uuid: 'asm_test_1',
    activity_id: 42,
    activity_uuid: 'activity_test_1',
    course_id: 1,
    course_uuid: 'course_test_1',
    chapter_id: 10,
    kind: 'EXAM' as const,
    title: 'Test ManualAssessment',
    description: 'A test assessment',
    lifecycle: 'PUBLISHED',
    published_at: '2026-05-01T10:00:00Z',
    ...overrides,
  }
}

function mockFetchSuccess(data: unknown) {
  mocks.apiJson.mockResolvedValue(data)
}

function mockFetch404() {
  mocks.apiJson.mockRejectedValue(new APIError({ code: 'NOT_FOUND', message: 'Not found', status: 404 }))
}

function mockFetchNetworkError() {
  mocks.apiJson.mockRejectedValue(new Error('Network error'))
}

function mockMetaSuccess(data: unknown) {
  mocks.apiJson.mockResolvedValue(data)
  mocks.apiResult.mockResolvedValue({
    data,
    headers: {},
    requestId: null,
    status: 200,
    statusText: 'OK',
  })
}

function mockMetaFailure(detail = 'Operation failed') {
  const error = new APIError({ code: 'API_ERROR', message: detail, status: 400, data: { detail } })
  mocks.apiJson.mockRejectedValue(error)
  mocks.apiResult.mockRejectedValue(error)
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ── getAssessmentByUuid ───────────────────────────────────────────────────────

describe('getAssessmentByUuid', () => {
  it('returns the assessment on success', async () => {
    const assessment = makeAssessment()
    mockFetchSuccess(assessment)

    const result = await getAssessmentByUuid('asm_test_1')

    expect(mocks.apiJson).toHaveBeenCalledWith('assessments/asm_test_1', expect.any(Object))
    expect(result?.assessment_uuid).toBe('asm_test_1')
    expect(result?.lifecycle).toBe('PUBLISHED')
  })

  it('returns null on 404', async () => {
    mockFetch404()

    const result = await getAssessmentByUuid('ghost_uuid')

    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    mockFetchNetworkError()

    const result = await getAssessmentByUuid('any_uuid')

    expect(result).toBeNull()
  })
})

// ── getAssessmentByActivityUuid ───────────────────────────────────────────────

describe('getAssessmentByActivityUuid', () => {
  it('calls the activity-scoped endpoint', async () => {
    const assessment = makeAssessment({ activity_uuid: 'activity_abc' })
    mockFetchSuccess(assessment)

    const result = await getAssessmentByActivityUuid('activity_abc')

    expect(mocks.apiJson).toHaveBeenCalledWith('assessments/activity/activity_abc', expect.any(Object))
    expect(result?.activity_uuid).toBe('activity_abc')
  })

  it('returns null on 404', async () => {
    mockFetch404()

    const result = await getAssessmentByActivityUuid('activity_ghost')

    expect(result).toBeNull()
  })

  it('returns null on unexpected error', async () => {
    mockFetchNetworkError()

    const result = await getAssessmentByActivityUuid('activity_err')

    expect(result).toBeNull()
  })
})

// ── getAttemptState ───────────────────────────────────────────────────────────

describe('getAttemptState', () => {
  it('returns the attempt projection on success', async () => {
    const state = {
      assessment_uuid: 'asm_1',
      submission_uuid: null,
      submission_status: null,
      release_state: null,
      recommended_action: 'start',
      can_start: true,
      can_submit: false,
      can_continue: false,
      can_view_result: false,
      can_edit: false,
      can_save_draft: false,
      can_start_revision: false,
      is_returned_for_revision: false,
      is_result_visible: false,
      primary_button_label_key: 'start',
      score: null,
      disabled_action_reasons: [],
      effective_policy: null,
      server_now: null,
      started_at: null,
      timer_started_at: null,
      timer_expires_at: null,
      available_at: null,
      closes_at: null,
      due_at: null,
      time_remaining_seconds: null,
      content_version: 1,
      policy_version: 1,
    }
    mockMetaSuccess(state)

    const result = await getAttemptState('asm_1')

    expect(mocks.apiJson).toHaveBeenCalledWith(
      'assessments/asm_1/attempt-state',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result?.recommended_action).toBe('start')
    expect(result?.can_start).toBe(true)
  })

  it('returns null on failure', async () => {
    mockMetaFailure('Not found')

    const result = await getAttemptState('ghost')

    expect(result).toBeNull()
  })
})

// ── getPolicyPreset ───────────────────────────────────────────────────────────

describe('getPolicyPreset', () => {
  it('fetches the policy preset for a given kind', async () => {
    const preset = {
      kind: 'EXAM',
      grade_release_mode: 'IMMEDIATE',
      grading_mode: 'MANUAL',
      completion_rule: 'GRADED',
      passing_score: 60,
      max_attempts: null,
      time_limit_seconds: null,
      allow_late: true,
      anti_cheat_enabled: false,
      review_visibility: 'AFTER_GRADING',
    }
    mockMetaSuccess(preset)

    const result = await getPolicyPreset('EXAM')

    expect(mocks.apiJson).toHaveBeenCalledWith('assessments/policy-preset/EXAM', expect.any(Object))
    expect(result?.grade_release_mode).toBe('IMMEDIATE')
    expect(result?.grading_mode).toBe('MANUAL')
  })

  it('returns null on failure', async () => {
    mockMetaFailure('Unknown kind')

    const result = await getPolicyPreset('UNKNOWN')

    expect(result).toBeNull()
  })
})

// ── listStudentPolicyOverrides ────────────────────────────────────────────────

describe('listStudentPolicyOverrides', () => {
  it('returns list of overrides on success', async () => {
    const overrides = [{ id: 1, user_id: 5, policy_id: 10, max_attempts_override: 3 }]
    mockMetaSuccess(overrides)

    const result = await listStudentPolicyOverrides('asm_1')

    expect(mocks.apiJson).toHaveBeenCalledWith('assessments/asm_1/overrides', expect.any(Object))
    expect(result).toHaveLength(1)
    expect(result[0]!.max_attempts_override).toBe(3)
  })

  it('returns empty array on failure', async () => {
    mockMetaFailure('Forbidden')

    const result = await listStudentPolicyOverrides('asm_1')

    expect(result).toEqual([])
  })
})

// ── createStudentPolicyOverride ───────────────────────────────────────────────

describe('createStudentPolicyOverride', () => {
  it('POSTs and returns created override', async () => {
    const override = {
      id: 1,
      user_id: 5,
      policy_id: 10,
      max_attempts_override: 2,
    }
    mockMetaSuccess(override)

    const result = await createStudentPolicyOverride('asm_1', {
      user_id: 5,
      max_attempts_override: 2,
    })

    expect(mocks.apiJson).toHaveBeenCalledWith(
      'assessments/asm_1/overrides',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ user_id: 5, max_attempts_override: 2 }),
      }),
    )
    expect(result.id).toBe(1)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('overrides', 'max')
  })

  it('throws on failure', async () => {
    mockMetaFailure('User not enrolled')

    await expect(createStudentPolicyOverride('asm_1', { user_id: 999 })).rejects.toThrow('User not enrolled')
  })
})

// ── updateStudentPolicyOverride ───────────────────────────────────────────────

describe('updateStudentPolicyOverride', () => {
  it('PATCHes and returns the updated override', async () => {
    const updated = { id: 1, user_id: 5, policy_id: 10, max_attempts_override: 5 }
    mockMetaSuccess(updated)

    const result = await updateStudentPolicyOverride('asm_1', 5, {
      max_attempts_override: 5,
    })

    expect(mocks.apiJson).toHaveBeenCalledWith(
      'assessments/asm_1/overrides/5',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ max_attempts_override: 5 }),
      }),
    )
    expect(result.max_attempts_override).toBe(5)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('overrides', 'max')
  })

  it('throws on failure', async () => {
    mockMetaFailure('Override not found')

    await expect(updateStudentPolicyOverride('asm_1', 999, {})).rejects.toThrow('Override not found')
  })
})

// ── deleteStudentPolicyOverride ───────────────────────────────────────────────

describe('deleteStudentPolicyOverride', () => {
  it('sends DELETE and revalidates on success', async () => {
    mockMetaSuccess(null)

    await deleteStudentPolicyOverride('asm_1', 5)

    expect(mocks.apiJson).toHaveBeenCalledWith(
      'assessments/asm_1/overrides/5',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(mocks.revalidateTag).toHaveBeenCalledWith('overrides', 'max')
  })

  it('throws on failure', async () => {
    mockMetaFailure('Override not found')

    await expect(deleteStudentPolicyOverride('asm_1', 999)).rejects.toThrow('Override not found')
  })
})

// ── saveGradingDraft ──────────────────────────────────────────────────────────

describe('saveGradingDraft', () => {
  it('PATCHes the grade endpoint with item grades', async () => {
    mockMetaSuccess({ submission_uuid: 'sub_1', status: 'GRADED' })

    const payload = {
      item_grades: [{ item_uuid: 'item_1', score: 80, feedback: 'Good.' }],
      overall_feedback: 'Well done',
      status: 'publish' as const,
    }
    await saveGradingDraft('asm_1', 'sub_1', payload)

    expect(mocks.apiJson).toHaveBeenCalledWith(
      'assessments/asm_1/submissions/sub_1/grade',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    )
    expect(mocks.revalidateTag).toHaveBeenCalledWith('submissions', 'max')
  })

  it('includes If-Match header when version is provided', async () => {
    mockMetaSuccess({ submission_uuid: 'sub_v3' })

    await saveGradingDraft('asm_1', 'sub_v3', { item_grades: [] }, 3)

    const [, opts] = mocks.apiJson.mock.calls[0]!
    expect(opts.headers['If-Match']).toBe('3')
  })

  it('throws StaleGradeError when server returns 412', async () => {
    mocks.apiJson.mockRejectedValue(new APIError({ code: 'STALE_GRADE', message: 'Stale grade', status: 412 }))
    // Mock the subsequent getAssessmentSubmission call
    const { StaleGradeError } = await import('@/services/grading/errors')

    // The function dynamically imports grading module; mock it too
    vi.doMock('@/services/grading/grading', () => ({
      getAssessmentSubmission: vi.fn().mockResolvedValue({ submission_uuid: 'sub_stale', version: 5 }),
    }))

    await expect(saveGradingDraft('asm_1', 'sub_stale', { item_grades: [] }, 2)).rejects.toBeInstanceOf(StaleGradeError)
  })

  it('throws on generic failure', async () => {
    mockMetaFailure('Grade conflict')

    await expect(saveGradingDraft('asm_1', 'sub_err', { item_grades: [] })).rejects.toThrow('Grade conflict')
  })
})

// ── runCodeItem ───────────────────────────────────────────────────────────────

describe('runCodeItem', () => {
  it('POSTs code run request and returns result', async () => {
    const runResult = {
      run_id: 'run_1',
      status: 'ACCEPTED',
      passed: 3,
      total: 3,
      score: 100,
    }
    mockMetaSuccess(runResult)

    const payload = { source: 'print("hello")', language: 71 }
    const result = await runCodeItem('asm_1', 'item_code_1', payload)

    expect(mocks.apiJson).toHaveBeenCalledWith(
      'assessments/asm_1/items/item_code_1/runs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
    expect(result.status).toBe('ACCEPTED')
    expect(result.passed).toBe(3)
  })

  it('throws on failure', async () => {
    mockMetaFailure('Language not supported')

    await expect(runCodeItem('asm_1', 'item_1', { source: 'code', language: 999 })).rejects.toThrow(
      'Language not supported',
    )
  })
})
