import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  apiResult: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiJson: mocks.apiJson,
  apiResult: mocks.apiResult,
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}))

import { getAssessmentSubmission, publishAssessmentGrades, saveGrade } from '@/services/grading/grading'

const SUB_ID = '11111111-1111-4111-8111-111111111111'
const ASM_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

/** A wire-shaped `TeacherSubmission` (v2 `GET /submissions/{id}/review` / `PATCH .../grade` response). */
function wireTeacherSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    assessment_id: ASM_ID,
    user: { id: USER_ID, username: 'student.one', display_name: 'Student One', email: 'student.one@example.com' },
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
    ...overrides,
  }
}

function mockSuccess(data: unknown) {
  mocks.apiJson.mockResolvedValue(data)
  mocks.apiResult.mockResolvedValue({
    data,
    headers: {},
    requestId: null,
    status: 200,
    statusText: 'OK',
  })
}

describe('grading service canonical assessment endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the grader view of a submission from the v2 review route', async () => {
    mockSuccess(wireTeacherSubmission())

    const result = await getAssessmentSubmission(ASM_ID, SUB_ID)

    expect(mocks.apiJson).toHaveBeenCalledWith(`submissions/${SUB_ID}/review`, {
      next: { tags: ['submissions', `assessment-${ASM_ID}`] },
    })
    expect(result?.submission_uuid).toBe(SUB_ID)
    expect(result?.status).toBe('GRADED')
    expect(result?.final_score).toBe(85)
  })

  it('saves a grade through the v2 submissions grade route with a quoted If-Match version', async () => {
    mockSuccess(wireTeacherSubmission({ final_score: 92, status: 'published', release_state: 'visible' }))

    const result = await saveGrade(
      SUB_ID,
      { final_score: 92, feedback: 'Done', status: 'PUBLISHED', item_grades: [] },
      7,
      ASM_ID,
    )

    expect(mocks.apiJson).toHaveBeenCalledWith(`submissions/${SUB_ID}/grade`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"7"' },
      body: JSON.stringify({
        action: 'publish',
        feedback: 'Done',
        final_score: 92,
        item_grades: [],
      }),
    })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('submissions', 'max')
    expect(result.status).toBe('PUBLISHED')
    expect(result.final_score).toBe(92)
  })

  it('publishes held grades through the assessment-scoped route', async () => {
    const payload = {
      published_count: 2,
      already_published_count: 1,
    }
    mockSuccess(payload)

    const result = await publishAssessmentGrades('asm_1')

    expect(mocks.apiJson).toHaveBeenCalledWith('assessments/asm_1/publish-grades', {
      method: 'POST',
    })
    expect(result).toEqual(payload)
  })
})
