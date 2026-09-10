import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  languages: vi.fn(),
  runItem: vi.fn(),
  getActivityAssessment: vi.fn(),
}))

vi.mock('@/lib/api/generated/code/code', () => ({
  languages: mocks.languages,
  runItem: mocks.runItem,
}))

vi.mock('@/lib/api/generated/assessments/assessments', () => ({
  getActivityAssessment: mocks.getActivityAssessment,
}))

import { getJudge0Languages, runTests } from '@/services/courses/code-challenges'

const ITEM_ID = '55555555-5555-4555-8555-555555555555'
const ASM_ID = '22222222-2222-4222-8222-222222222222'
const ACTIVITY_ID = '66666666-6666-4666-8666-666666666666'
const COURSE_ID = '44444444-4444-4444-8444-444444444444'

const policy = {
  grading_mode: 'auto',
  grade_release_mode: 'immediate',
  completion_rule: 'submit',
  passing_score: 60,
  allow_late: false,
  late_policy: { kind: 'none' },
  required: true,
  review_visibility: 'full',
  randomize_questions: false,
  randomize_options: false,
  partial_credit: true,
  negative_marking_percent: 0,
  grace_period_minutes: 0,
  copy_paste_protection: false,
  tab_switch_detection: false,
  devtools_detection: false,
  right_click_disabled: false,
  fullscreen_required: false,
  violation_threshold: 3,
  attempt_penalty_percent: 0,
}

function wireAssessment() {
  return {
    id: ASM_ID,
    activity_id: ACTIVITY_ID,
    course_id: COURSE_ID,
    kind: 'code_challenge',
    title: 'Two Sum',
    description: 'Solve it',
    lifecycle: 'published',
    weight: 1,
    grading_type: 'numeric',
    content_version: 1,
    policy_version: 1,
    policy,
    access_mode: 'course',
    created_at_unix: 0,
    updated_at_unix: 0,
    items: [
      {
        id: ITEM_ID,
        position: 1,
        kind: 'code',
        title: 'Two Sum',
        max_score: 100,
        metadata: { tags: [], outcome_ids: [] },
        body: {
          kind: 'code',
          prompt: 'Add two numbers',
          languages: [71],
          starter_code: {},
          tests: [],
        },
      },
    ],
  }
}

describe('getJudge0Languages', () => {
  it('reads the v2 code/languages route via the generated fetcher', async () => {
    mocks.languages.mockResolvedValue([{ id: 71, name: 'Python', monaco_language: 'python' }])

    const result = await getJudge0Languages()

    expect(mocks.languages).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ id: 71, name: 'Python', monaco_language: 'python' }])
  })
})

describe('runTests', () => {
  it('resolves the code item from GET activities/{id}/assessment and runs via assessment-items/{id}/runs', async () => {
    mocks.getActivityAssessment.mockResolvedValue(wireAssessment())
    mocks.runItem.mockResolvedValue({
      id: 'run_1',
      assessment_id: ASM_ID,
      item_id: ITEM_ID,
      purpose: 'visible',
      status: 'accepted',
      language_id: 71,
      passed: 1,
      total: 1,
      replayed: false,
      created_at_unix: 0,
      cases: [
        {
          test_id: 'case_1',
          passed: true,
          is_visible: true,
          status_description: 'Accepted',
          description: '',
          weight: 1,
        },
      ],
    })

    const result = await runTests('activity_two-sum', 'print(1)', 71)

    expect(mocks.getActivityAssessment).toHaveBeenCalledWith('two-sum')
    expect(mocks.runItem).toHaveBeenCalledWith(
      ITEM_ID,
      { language_id: 71, source: 'print(1)' },
      expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }) }),
    )
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.passed).toBe(true)
  })
})
