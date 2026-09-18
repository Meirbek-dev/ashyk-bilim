import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({ apiJson: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@/lib/api/generated/zod', () => ({ AssessmentDetail: { parse: (d: unknown) => d } }))

import { createExamWithActivityMutationOptions } from '@/features/assessments/registry/exam/mutations'

const preset = {
  grading_mode: 'auto', grade_release_mode: 'immediate', completion_rule: 'submit', passing_score: 60,
  allow_late: false, late_policy: 'reject', required: true, review_visibility: 'none',
  randomize_questions: false, randomize_options: false, partial_credit: true, negative_marking_percent: 0,
  grace_period_minutes: 0, copy_paste_protection: false, tab_switch_detection: false, devtools_detection: false,
  right_click_disabled: false, fullscreen_required: false, violation_threshold: 3, attempt_penalty_percent: 0,
  max_attempts: 1, time_limit_seconds: null, due_at_unix: null,
}

describe('createExamWithActivity (v2)', () => {
  it('POSTs the v2 create body, then PUTs the preset merged with the modal settings', async () => {
    mocks.apiJson.mockImplementation(async (path: string) => {
      if (path === 'assessments') return { id: 'asm-1', activity_id: 'act-1', policy: preset }
      return {}
    })
    const queryClient = { invalidateQueries: vi.fn() } as never
    const opts = createExamWithActivityMutationOptions(queryClient, 'course-1')
    const result = await opts.mutationFn!({
      kind: 'exam', activityName: 'Тест по введению', chapterId: 'ch-1', examDescription: 'Основы',
      settings: { time_limit: 30, shuffle_questions: true, allow_result_review: false, attempt_limit: 1, violation_threshold: 3 },
    } as never, undefined as never)

    const calls = mocks.apiJson.mock.calls as [string, { body: string }][]
    const [create, policy] = [calls[0]!, calls[1]!]
    expect(create[0]).toBe('assessments')
    // UX-112: one name — the activity name is the assessment title; no separate rename PATCH.
    expect(JSON.parse(create[1].body)).toEqual({ kind: 'exam', chapter_id: 'ch-1', title: 'Тест по введению', description: 'Основы', grading_type: 'percentage' })
    expect(policy[0]).toBe('assessments/asm-1/policy')
    const put = JSON.parse(policy[1].body)
    expect(put).toMatchObject({ ...preset, time_limit_seconds: 1800, randomize_questions: true, review_visibility: 'none', max_attempts: 1 })
    expect(Object.keys(put)).toEqual(expect.arrayContaining(Object.keys(preset)))
    expect(calls).toHaveLength(2)
    expect(result).toEqual({ exam_uuid: 'asm-1', activity_uuid: 'act-1' })
  })

  // UX-028: «Тест» creates a quiz on the server's quiz preset — no exam proctoring, no attempt cap.
  it('keeps the quiz preset: only the time limit / shuffle / review settings are applied', async () => {
    mocks.apiJson.mockClear()
    mocks.apiJson.mockImplementation(async (path: string) => {
      if (path === 'assessments') return { id: 'asm-2', activity_id: 'act-2', policy: { ...preset, max_attempts: null } }
      return {}
    })
    const opts = createExamWithActivityMutationOptions({ invalidateQueries: vi.fn() } as never, 'course-1')
    await opts.mutationFn!({
      kind: 'quiz', activityName: 'Quiz', chapterId: 'ch-1', examDescription: 'Basics',
      settings: { time_limit: 10, shuffle_questions: false, shuffle_answers: true, allow_result_review: true },
    } as never, undefined as never)

    const calls = mocks.apiJson.mock.calls as [string, { body: string }][]
    expect(JSON.parse(calls[0]![1].body).kind).toBe('quiz')
    expect(JSON.parse(calls[1]![1].body)).toMatchObject({
      max_attempts: null, time_limit_seconds: 600, fullscreen_required: false, devtools_detection: false,
      tab_switch_detection: false, randomize_options: true, review_visibility: 'full',
    })
  })
})
