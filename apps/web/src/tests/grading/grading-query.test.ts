import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  getCourse: vi.fn(),
  listCourseAssessments: vi.fn(),
  gradebook: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiJson: mocks.apiJson,
}))

vi.mock('@/lib/api/generated/courses/courses', () => ({
  getCourse: mocks.getCourse,
}))

vi.mock('@/lib/api/generated/assessments/assessments', () => ({
  listCourseAssessments: mocks.listCourseAssessments,
}))

vi.mock('@/lib/api/generated/grading/grading', () => ({
  gradebook: mocks.gradebook,
}))

import { courseGradebookQueryOptions, gradingDetailQueryOptions } from '@/features/grading/queries/grading.query'

const SUB_ID = '11111111-1111-4111-8111-111111111111'
const ASM_ID = '22222222-2222-4222-8222-222222222222'
const COURSE_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '33333333-3333-4333-8333-333333333333'

describe('gradingDetailQueryOptions', () => {
  it('reads the grader view from the v2 review route, not the legacy assessment-scoped path', async () => {
    mocks.apiJson.mockResolvedValue({
      id: SUB_ID,
      assessment_id: ASM_ID,
      user: { id: USER_ID, username: 'student', display_name: 'Student', email: 'student@example.com' },
      status: 'graded',
      release_state: 'awaiting_release',
      attempt_number: 1,
      answers: {},
      grading: { feedback: '', items: [], needs_manual_review: false, auto_graded: false },
      is_late: false,
      late_penalty_pct: 0,
      violation_count: 0,
      violations: [],
      version: 1,
      content_version: 1,
      policy_version: 1,
      feedback: [],
    })

    const result = await gradingDetailQueryOptions(SUB_ID, ASM_ID).queryFn?.(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
    )

    expect(mocks.apiJson).toHaveBeenCalledWith(`submissions/${SUB_ID}/review`)
    expect(result?.submission_uuid).toBe(SUB_ID)
  })
})

describe('courseGradebookQueryOptions', () => {
  it('walks every keyset page and composes cells with the course + course assessments', async () => {
    mocks.getCourse.mockResolvedValue({
      id: COURSE_ID,
      name: 'Course',
      about: '',
      description: '',
      open_to_contributors: false,
      public: true,
      tags: [],
      created_at_unix: 0,
      updated_at_unix: 0,
    })
    mocks.listCourseAssessments.mockResolvedValue([
      {
        id: ASM_ID,
        activity_id: 'activity_1',
        course_id: COURSE_ID,
        kind: 'exam',
        title: 'Exam',
        description: '',
        lifecycle: 'published',
        weight: 1,
        grading_type: 'numeric',
        content_version: 1,
        policy_version: 1,
        policy: { passing_score: 60 },
        access_mode: 'course',
        created_at_unix: 0,
        updated_at_unix: 0,
      },
    ])
    mocks.gradebook
      .mockResolvedValueOnce({
        cells: [
          {
            user_id: USER_ID,
            assessment_id: ASM_ID,
            submission_id: SUB_ID,
            status: 'published',
            attempt_number: 1,
            attempts: 1,
            is_late: false,
            final_score: 90,
          },
        ],
        users: [{ id: USER_ID, username: 'student', display_name: 'Student', email: 'student@example.com' }],
        assessments: [{ id: ASM_ID, title: 'Exam', kind: 'exam', passing_score: 60 }],
        next_cursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        cells: [],
        users: [],
        assessments: [],
        next_cursor: null,
      })

    const result = await courseGradebookQueryOptions(COURSE_ID).queryFn?.(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
    )

    expect(mocks.gradebook).toHaveBeenCalledTimes(2)
    expect(mocks.gradebook).toHaveBeenNthCalledWith(1, COURSE_ID, undefined)
    expect(mocks.gradebook).toHaveBeenNthCalledWith(2, COURSE_ID, { cursor: 'cursor-2' })
    expect(result?.course_id).toBe(COURSE_ID)
    expect(result?.cells).toHaveLength(1)
    expect(result?.cells[0]?.score).toBe(90)
    expect(result?.activities[0]?.activity_uuid).toBe('activity_1')
  })
})
