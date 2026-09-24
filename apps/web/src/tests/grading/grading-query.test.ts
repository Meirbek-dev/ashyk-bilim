import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  apiBody: vi.fn(),
  getCourse: vi.fn(),
  getCurriculum: vi.fn(),
  gradebook: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiJson: mocks.apiJson,
  apiBody: mocks.apiBody,
}))

vi.mock('@/lib/api/generated/courses/courses', () => ({
  getCourse: mocks.getCourse,
  getCurriculum: mocks.getCurriculum,
}))

vi.mock('@/lib/api/generated/grading/grading', () => ({
  gradebook: mocks.gradebook,
}))

import {
  GRADEBOOK_POLL_MS,
  collectGradebookPages,
  courseGradebookQueryOptions,
  downloadGradebookCsv,
  gradingDetailQueryOptions,
  submissionsQueryOptions,
} from '@/features/grading/queries/grading.query'

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
    mocks.getCurriculum.mockResolvedValue({
      chapters: [{ activities: [{ id: 'activity_1', name: 'Week 3 · Exam' }] }],
    })
    mocks.gradebook
      .mockResolvedValueOnce({
        cells: [
          {
            user_id: USER_ID,
            activity_id: 'activity_1',
            assessment_id: ASM_ID,
            submission_id: SUB_ID,
            file_submission_id: null,
            attempt_id: null,
            status: 'published',
            attempt_number: 1,
            attempts: 1,
            is_late: false,
            final_score: 90,
          },
        ],
        users: [{ id: USER_ID, username: 'student', display_name: 'Student', email: 'student@example.com' }],
        assessments: [{ id: ASM_ID, activity_id: 'activity_1', title: 'Exam', kind: 'exam', passing_score: 60 }],
        file_submissions: [],
        next_cursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        cells: [],
        users: [],
        assessments: [],
        file_submissions: [],
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
    expect(result?.activities[0]?.name).toBe('Week 3 · Exam')
  })
  // BUG-265: the walk used to stop silently at page 20 — page 21 held a pending cell.
  it('walks past page 20 to the last page and fails loudly on a cursor that never ends', async () => {
    const empty = { cells: [], users: [], assessments: [], file_submissions: [] }
    mocks.gradebook.mockReset()
    mocks.gradebook.mockImplementation(async (_course: string, params?: { cursor: string }) => {
      const index = params ? Number(params.cursor) : 1
      return { ...empty, next_cursor: index < 21 ? String(index + 1) : null }
    })
    await expect(collectGradebookPages(COURSE_ID)).resolves.toHaveLength(21)
    expect(mocks.gradebook).toHaveBeenLastCalledWith(COURSE_ID, { cursor: '21' })

    mocks.gradebook.mockReset()
    mocks.gradebook.mockResolvedValue({ ...empty, next_cursor: 'again' })
    await expect(collectGradebookPages(COURSE_ID, 5)).rejects.toThrow('Gradebook did not end after 5 pages')
  })
  // Gauntlet F27: the course grading stream drives refreshes; polling is only
  // the fallback while the stream is not connected.
  it('polls only while the grading stream is not live', () => {
    const fallback = courseGradebookQueryOptions(COURSE_ID)
    expect(fallback.refetchInterval).toBe(GRADEBOOK_POLL_MS)
    expect(fallback.refetchIntervalInBackground).toBe(false)
    expect(courseGradebookQueryOptions(COURSE_ID, undefined, { live: true }).refetchInterval).toBe(false)
  })

  // Q-2026-09-12-2 #3: the export is the server's CSV, localized by Accept-Language.
  it('downloads the server CSV with the current locale', async () => {
    const blob = new Blob(['\uFEFFСтудент,Email'])
    mocks.apiBody.mockResolvedValue(blob)
    await expect(downloadGradebookCsv(COURSE_ID, 'kk-KZ')).resolves.toBe(blob)
    expect(mocks.apiBody).toHaveBeenCalledWith(`courses/${COURSE_ID}/gradebook/export`, {
      responseType: 'blob',
      headers: { 'Accept-Language': 'kk-KZ' },
    })
  })
})

describe('submissionsQueryOptions', () => {
  it('reads the keyset queue with v2 params only and keeps the learner display name', async () => {
    mocks.apiJson.mockReset()
    mocks.apiJson.mockResolvedValue({
      items: [
        {
          id: SUB_ID,
          user: { id: USER_ID, username: 'learner', display_name: 'Aigerim Critic', email: 'learner@example.com' },
          status: 'graded',
          attempt_number: 1,
          is_late: false,
          version: 1,
          auto_score: 100,
          final_score: 100,
          submitted_at_unix: 1_789_000_000,
          graded_at_unix: 1_789_000_010,
          enrolled: false,
        },
      ],
      next_cursor: null,
    })

    const result = await submissionsQueryOptions({
      assessmentUuid: ASM_ID,
      page: 1,
      pageSize: 10,
      search: 'aig',
      sortBy: 'submitted_at',
      sortDir: 'desc',
      status: 'NEEDS_GRADING',
    }).queryFn?.(undefined as never)

    const [path] = mocks.apiJson.mock.calls[0] as [string]
    const params = new URL(path, 'http://x').searchParams
    expect(path.startsWith(`assessments/${ASM_ID}/submissions?`)).toBe(true)
    expect(Object.fromEntries(params)).toEqual({ status: 'needs_grading', search: 'aig', limit: '10' })
    // No legacy paging / sorting on the wire (`page`, `page_size`, `sort_by` are 400s on v2)
    expect(params.has('page')).toBe(false)
    expect(params.has('sort_by')).toBe(false)

    expect(result?.items[0]?.user?.first_name).toBe('Aigerim Critic')
    expect(result?.items[0]?.status).toBe('GRADED')
    // UX-167: membership rides along so the bulk extension can leave a leaver out.
    expect(result?.items[0]?.enrolled).toBe(false)
    expect(result?.pages).toBe(1)
  })
})
