/**
 * Unit tests for the assessments service module.
 *
 * Covers:
 *  - `getAssessmentByUuid` — success, null on 404, null on network error
 *  - `getAssessmentByActivityUuid` — success, null on 404, null on network error
 *  - `saveGradingDraft` — success, throws StaleGradeError on 412, throws on failure
 */

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { APIError } from '@/lib/api/assertSuccess'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  apiResult: vi.fn(),
  revalidateTag: vi.fn(),
  getAssessmentSubmission: vi.fn(),
  getAssessment: vi.fn(),
  getActivityAssessment: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiJson: mocks.apiJson,
  apiResult: mocks.apiResult,
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}))

// v2: getAssessmentByUuid/ByActivityUuid go through the generated Orval
// fetchers, not apiJson — mock those directly rather than the transport.
vi.mock('@/lib/api/generated/assessments/assessments', () => ({
  getAssessment: mocks.getAssessment,
  getActivityAssessment: mocks.getActivityAssessment,
}))

vi.mock('@services/config/config', () => ({
  getAPIUrl: vi.fn(() => 'http://api.test/'),
  getServerAPIUrl: vi.fn(() => 'http://server:8000/api/v2/'),
}))

// Import AFTER mocks
import { saveGradingDraft } from '@/services/assessments/assessment-actions'
import { getAssessmentByUuid, getAssessmentByActivityUuid } from '@/services/assessments/assessments'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A wire-shaped `AssessmentDetail` (v2 `GET assessments/{id}` / `GET activities/{id}/assessment` response). */
function wireAssessmentDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asm_test_1',
    activity_id: 'activity_test_1',
    course_id: 'course_test_1',
    kind: 'exam' as const,
    title: 'Test ManualAssessment',
    description: 'A test assessment',
    lifecycle: 'published',
    published_at_unix: 1_746_093_600,
    scheduled_at_unix: null,
    archived_at_unix: null,
    ...overrides,
  }
}

/** A wire-shaped `TeacherSubmission` (v2 `PATCH submissions/{id}/grade` response). Mirrors grading-service.test.ts. */
function wireTeacherSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    assessment_id: '22222222-2222-4222-8222-222222222222',
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      username: 'student.one',
      display_name: 'Student One',
      email: 'student.one@example.com',
    },
    status: 'graded',
    release_state: 'awaiting_release',
    attempt_number: 1,
    answers: {},
    grading: { feedback: 'Good work.', items: [], needs_manual_review: false, auto_graded: false },
    is_late: false,
    late_penalty_pct: 0,
    violation_count: 0,
    violations: [],
    version: 1,
    content_version: 1,
    policy_version: 1,
    feedback: [],
    final_score: 85,
    auto_score: 80,
    started_at_unix: 1_700_000_000,
    submitted_at_unix: 1_700_000_100,
    graded_at_unix: 1_700_000_200,
    allowed_actions: [],
    auto_submit_reason: null,
    duration_seconds: 100,
    score_override: null,
    ...overrides,
  }
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
    const assessment = wireAssessmentDetail()
    mocks.getAssessment.mockResolvedValue(assessment)

    const result = await getAssessmentByUuid('asm_test_1')

    expect(mocks.getAssessment).toHaveBeenCalledWith('asm_test_1')
    expect(result?.assessment_uuid).toBe('asm_test_1')
    expect(result?.lifecycle).toBe('published')
  })

  it('returns null on 404', async () => {
    mocks.getAssessment.mockRejectedValue(new APIError({ code: 'NOT_FOUND', message: 'Not found', status: 404 }))

    const result = await getAssessmentByUuid('ghost_uuid')

    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    mocks.getAssessment.mockRejectedValue(new Error('Network error'))

    const result = await getAssessmentByUuid('any_uuid')

    expect(result).toBeNull()
  })
})

// ── getAssessmentByActivityUuid ───────────────────────────────────────────────

describe('getAssessmentByActivityUuid', () => {
  it('calls the activity-scoped endpoint', async () => {
    const assessment = wireAssessmentDetail({ activity_id: 'activity_abc' })
    mocks.getActivityAssessment.mockResolvedValue(assessment)

    const result = await getAssessmentByActivityUuid('activity_abc')

    expect(mocks.getActivityAssessment).toHaveBeenCalledWith('activity_abc')
    expect(result?.activity_uuid).toBe('activity_abc')
  })

  it('returns null on 404', async () => {
    mocks.getActivityAssessment.mockRejectedValue(
      new APIError({ code: 'NOT_FOUND', message: 'Not found', status: 404 }),
    )

    const result = await getAssessmentByActivityUuid('activity_ghost')

    expect(result).toBeNull()
  })

  it('returns null on unexpected error', async () => {
    mocks.getActivityAssessment.mockRejectedValue(new Error('Network error'))

    const result = await getAssessmentByActivityUuid('activity_err')

    expect(result).toBeNull()
  })
})

// ── saveGradingDraft ──────────────────────────────────────────────────────────

describe('saveGradingDraft', () => {
  it('PATCHes the grade endpoint with item grades', async () => {
    mockMetaSuccess(wireTeacherSubmission())

    const payload = {
      item_grades: [{ item_uuid: 'item_1', score: 80, feedback: 'Good.' }],
      overall_feedback: 'Well done',
      status: 'publish' as const,
    }
    await saveGradingDraft('asm_1', 'sub_1', payload)

    // v2: `PATCH submissions/{id}/grade` (no assessment prefix), body translated
    // onto the real `GradeRequest` wire shape ({action, feedback, item_grades}
    // with `item_id` in place of `item_uuid`).
    expect(mocks.apiJson).toHaveBeenCalledWith(
      'submissions/sub_1/grade',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          action: 'publish',
          feedback: 'Well done',
          item_grades: [{ item_id: 'item_1', score: 80, feedback: 'Good.' }],
        }),
      }),
    )
  })

  it('includes If-Match header when version is provided', async () => {
    mockMetaSuccess(wireTeacherSubmission())

    await saveGradingDraft('asm_1', 'sub_v3', { item_grades: [] }, 3)

    const [, opts] = mocks.apiJson.mock.calls[0]!
    // v2: set through ifMatchHeaders, which quotes the entity tag.
    expect(opts.headers['If-Match']).toBe('"3"')
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
