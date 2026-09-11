import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  codeGetRun: vi.fn(),
  languages: vi.fn(),
  mySubmissions: vi.fn(),
  runItem: vi.fn(),
  getActivityAssessment: vi.fn(),
}))

vi.mock('@/lib/api/generated/code/code', () => ({
  codeGetRun: mocks.codeGetRun,
  languages: mocks.languages,
  runItem: mocks.runItem,
}))

vi.mock('@/lib/api/generated/submissions/submissions', () => ({
  mySubmissions: mocks.mySubmissions,
}))

vi.mock('@/lib/api/generated/assessments/assessments', () => ({
  getActivityAssessment: mocks.getActivityAssessment,
}))

import { isApiError } from '@/lib/api/assertSuccess'
import { getJudge0Languages, getSubmissions, runTests } from '@/services/courses/code-challenges'

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

const RUN_ID = '77777777-7777-4777-8777-777777777777'

function wireRun(status: 'queued' | 'running' | 'accepted' | 'degraded', cases = 1) {
  return {
    id: RUN_ID,
    assessment_id: ASM_ID,
    item_id: ITEM_ID,
    purpose: 'visible',
    status,
    language_id: 71,
    passed: status === 'accepted' ? cases : 0,
    total: cases,
    replayed: false,
    created_at_unix: 0,
    cases:
      status === 'accepted'
        ? [
            {
              test_id: 'case_1',
              passed: true,
              is_visible: true,
              status_description: 'Accepted',
              description: '',
              weight: 1,
            },
          ]
        : [],
  }
}

describe('runTests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('resolves the code item from GET activities/{id}/assessment and runs via assessment-items/{id}/runs', async () => {
    mocks.getActivityAssessment.mockResolvedValue(wireAssessment())
    mocks.runItem.mockResolvedValue(wireRun('accepted'))

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

  it('polls GET code-runs/{id} until the run leaves queued/running', async () => {
    vi.useFakeTimers()
    mocks.getActivityAssessment.mockResolvedValue(wireAssessment())
    mocks.runItem.mockResolvedValue(wireRun('queued'))
    mocks.codeGetRun.mockResolvedValueOnce(wireRun('running')).mockResolvedValueOnce(wireRun('accepted'))

    const pending = runTests('activity_two-sum', 'print(1)', 71)
    await vi.advanceTimersByTimeAsync(2500)
    const result = await pending

    expect(mocks.codeGetRun).toHaveBeenCalledTimes(2)
    expect(mocks.codeGetRun).toHaveBeenCalledWith(RUN_ID)
    expect(result.results[0]?.passed).toBe(true)
  })

  it('surfaces a degraded run under the contract code', async () => {
    mocks.getActivityAssessment.mockResolvedValue(wireAssessment())
    mocks.runItem.mockResolvedValue(wireRun('degraded'))

    const error = await runTests('activity_two-sum', 'print(1)', 71).catch((thrown: unknown) => thrown)

    expect(isApiError(error) && error.code).toBe('code-runner-degraded')
  })
})

describe('getSubmissions', () => {
  it('reads GET assessments/{id}/submissions/me and lists attempts newest first', async () => {
    mocks.getActivityAssessment.mockResolvedValue(wireAssessment())
    mocks.mySubmissions.mockResolvedValue([
      {
        id: 's1',
        attempt_number: 1,
        status: 'published',
        final_score: 50,
        auto_score: 50,
        answers: { [ITEM_ID]: { kind: 'code', language: 71, source: 'print(1)' } },
        started_at_unix: 10,
        submitted_at_unix: 20,
      },
      {
        id: 's2',
        attempt_number: 2,
        status: 'pending',
        final_score: null,
        auto_score: null,
        answers: { [ITEM_ID]: { kind: 'code', language: 63, source: 'x' } },
        started_at_unix: 30,
        submitted_at_unix: 40,
      },
    ])

    const result = await getSubmissions('activity_two-sum')

    expect(mocks.mySubmissions).toHaveBeenCalledWith(ASM_ID)
    expect(result.map(submission => submission.id)).toEqual(['s2', 's1'])
    expect(result[0]).toMatchObject({ status: 'pending', score: null, language_id: 63, submitted_at_unix: 40 })
    expect(result[1]).toMatchObject({ status: 'published', score: 50, language_id: 71, max_score: 100 })
  })
})
