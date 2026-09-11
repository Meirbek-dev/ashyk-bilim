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
      activityName: 'Тест по введению', chapterId: 'ch-1', examTitle: 'Тест 1', examDescription: 'Основы',
      settings: { time_limit: 30, shuffle_questions: true, allow_result_review: false, attempt_limit: 1, violation_threshold: 3 },
    } as never, undefined as never)

    const calls = mocks.apiJson.mock.calls as [string, { body: string }][]
    const [create, policy, rename] = [calls[0]!, calls[1]!, calls[2]!]
    expect(create[0]).toBe('assessments')
    expect(JSON.parse(create[1].body)).toEqual({ kind: 'exam', chapter_id: 'ch-1', title: 'Тест 1', description: 'Основы', grading_type: 'percentage' })
    expect(policy[0]).toBe('assessments/asm-1/policy')
    const put = JSON.parse(policy[1].body)
    expect(put).toMatchObject({ ...preset, time_limit_seconds: 1800, randomize_questions: true, review_visibility: 'none', max_attempts: 1 })
    expect(Object.keys(put)).toEqual(expect.arrayContaining(Object.keys(preset)))
    expect(rename[0]).toBe('activities/act-1')
    expect(result).toEqual({ exam_uuid: 'asm-1', activity_uuid: 'act-1' })
  })
})
