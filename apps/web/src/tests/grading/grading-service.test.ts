import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiJson: vi.fn(),
  apiResult: vi.fn(),
  getResponseMetadata: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiFetch: mocks.apiFetch,
  getResponseMetadata: mocks.getResponseMetadata,
  apiJson: async (path: string, init?: any) => {
    const res = await mocks.apiFetch(path, init)
    if (!res.ok) {
      const err = new Error(res.statusText || 'API Error')
      try {
        const body = await res.json()
        if (body && body.detail) {
          err.message = body.detail
        }
      } catch {
        // ignore parse error if res.json() fails
      }
      throw err
    }
    return res.json()
  },
  apiResult: async (path: string, init?: any) => {
    const res = await mocks.apiFetch(path, init)
    const data = await res.json()
    return { data, headers: {}, requestId: null }
  },
}))

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}))

import { getAssessmentSubmission, publishAssessmentGrades, saveGrade } from '@/services/grading/grading'
import type { Submission } from '@/types/grading'

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 1,
    submission_uuid: 'sub_test_1',
    user_id: 10,
    activity_id: 42,
    status: 'GRADED',
    version: 1,
    final_score: 85,
    auto_score: 80,
    started_at: '2026-05-01T10:00:00Z',
    submitted_at: '2026-05-01T11:00:00Z',
    graded_at: '2026-05-01T12:00:00Z',
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T12:00:00Z',
    attempt_number: 1,
    is_late: false,
    grading_json: {
      feedback: 'Good work.',
      items: [],
      needs_manual_review: false,
      auto_graded: false,
    },
    raw_grading_json: {
      feedback: 'Auto result.',
      items: [],
      needs_manual_review: false,
      auto_graded: true,
    },
    answers_json: {},
    metadata_json: {},
    ...overrides,
  } as Submission
}

function mockSuccess(data: unknown) {
  const response = {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(data),
  }
  mocks.apiFetch.mockResolvedValue(response)
  mocks.getResponseMetadata.mockResolvedValue({
    success: true,
    data,
    status: 200,
  })
}

describe('grading service canonical assessment endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches a submission by assessment UUID', async () => {
    const submission = makeSubmission()
    mockSuccess(submission)

    const result = await getAssessmentSubmission('asm_1', 'sub_test_1')

    expect(mocks.apiFetch).toHaveBeenCalledWith('assessments/asm_1/submissions/sub_test_1', {
      next: { tags: ['submissions'] },
    })
    expect(result).toEqual(submission)
  })

  it('saves a grade through the assessment-scoped route', async () => {
    const submission = makeSubmission({ final_score: 92 })
    mockSuccess(submission)

    const result = await saveGrade(
      'sub_test_1',
      { final_score: 92, feedback: 'Done', status: 'GRADED', item_feedback: [] },
      7,
      'asm_1',
    )

    expect(mocks.apiFetch).toHaveBeenCalledWith('assessments/asm_1/submissions/sub_test_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': '7' },
      body: JSON.stringify({
        final_score: 92,
        feedback: 'Done',
        status: 'GRADED',
        item_feedback: [],
      }),
    })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('submissions', 'max')
    expect(result).toEqual(submission)
  })

  it('publishes held grades through the assessment-scoped route', async () => {
    const payload = {
      activity_id: 42,
      published_count: 2,
      already_published_count: 1,
    }
    mockSuccess(payload)

    const result = await publishAssessmentGrades('asm_1')

    expect(mocks.apiFetch).toHaveBeenCalledWith('assessments/asm_1/publish-grades', {
      method: 'POST',
    })
    expect(result).toEqual(payload)
  })
})
