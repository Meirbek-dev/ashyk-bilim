import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'
import { apiJson } from '@/lib/api-client'
import { APIError } from '@/lib/api/assertSuccess'
import type { StudentSubmission, AssessmentDetail, AttemptState } from '@/lib/api/generated/zod'
import { useAssessmentAttempt } from '@/features/assessments/hooks/useAssessment'
import {
  getAssessmentDraft,
  saveAssessmentDraft,
  submitAssessmentDraft,
} from '@/features/assessments/submission-client'
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/services/telemetry/client', () => ({ reportClientError: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

const assessmentId = '00000000-0000-4000-8000-000000000001'
const submissionId = '00000000-0000-4000-8000-000000000002'
const itemId = '00000000-0000-4000-8000-000000000003'
const activityId = '00000000-0000-4000-8000-000000000004'
const detail: AssessmentDetail = {
  id: assessmentId,
  activity_id: activityId,
  course_id: activityId,
  access_mode: 'all_course_learners',
  content_version: 2,
  policy_version: 3,
  created_at_unix: 1777982400,
  updated_at_unix: 1777982400,
  description: 'Assessment',
  grading_type: 'percentage',
  kind: 'exam',
  lifecycle: 'published',
  title: 'Exam',
  weight: 1,
  policy: {
    allow_late: false,
    attempt_penalty_percent: 0,
    completion_rule: 'passed',
    copy_paste_protection: false,
    devtools_detection: false,
    fullscreen_required: false,
    grace_period_minutes: 0,
    grade_release_mode: 'immediate',
    grading_mode: 'auto',
    late_policy: { kind: 'none' },
    max_attempts: 1,
    time_limit_seconds: 600,
    negative_marking_percent: 0,
    partial_credit: false,
    passing_score: 60,
    randomize_options: false,
    randomize_questions: false,
    required: true,
    review_visibility: 'full',
    right_click_disabled: false,
    tab_switch_detection: false,
    violation_threshold: 3,
  },
  items: [
    {
      id: itemId,
      kind: 'open_text',
      body: { kind: 'open_text', prompt: 'Explain' },
      max_score: 10,
      metadata: {},
      position: 1,
      title: 'Question',
    },
  ],
}
const attemptState: AttemptState = {
  attempts_remaining: 2,
  attempts_used: 1,
  can_continue: true,
  can_start: false,
  disabled_reasons: [],
  draft_id: submissionId,
  is_teacher_preview: false,
  lifecycle: 'published',
  revision_requested: false,
  effective: {
    allow_late: false,
    due_at_unix: 1777990000,
    late_policy: { kind: 'none' },
    max_attempts: 3,
    override_applied: true,
    passing_score: 60,
    time_limit_seconds: 1200,
    waive_late_penalty: false,
  },
}
const fixture: StudentSubmission = {
  id: submissionId,
  assessment_id: assessmentId,
  status: 'draft',
  release_state: 'hidden',
  answers: { [itemId]: { kind: 'open_text', text: 'server' } },
  answered_count: 1,
  total_items: 1,
  attempt_number: 1,
  draft_version: 3,
  is_late: false,
  violation_count: 0,
  started_at_unix: 1777982400,
}
beforeEach(() => vi.resetAllMocks())

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('v2 learner submissions', () => {
  it('uses effective learner overrides and the server attempt permissions', async () => {
    vi.mocked(apiJson).mockImplementation(async (path, _init, parse) =>
      parse!(
        String(path).endsWith('/assessment')
          ? detail
          : String(path).endsWith('/attempt-state')
            ? attemptState
            : [fixture],
      ),
    )
    const { result } = renderHook(() => useAssessmentAttempt(activityId), { wrapper })
    await waitFor(() => expect(result.current.vm?.surface).toBe('ATTEMPT'))
    const projection = result.current.vm
    if (projection?.surface !== 'ATTEMPT') throw new Error('Missing attempt projection')
    expect(projection.vm).toMatchObject({
      assessmentUuid: assessmentId,
      activityUuid: activityId,
      canStart: false,
      canContinue: true,
      canSubmit: true,
      recommendedAction: 'continueDraft',
      timerExpiresAt: '2026-05-05T12:20:00.000Z',
      dueAt: new Date(1777990000 * 1000).toISOString(),
      items: [{ id: itemId, kind: 'OPEN_TEXT' }],
    })
  })

  it('allows a returned revision only when the server permits another start', async () => {
    vi.mocked(apiJson).mockImplementation(async (path, _init, parse) =>
      parse!(
        String(path).endsWith('/assessment')
          ? detail
          : String(path).endsWith('/attempt-state')
            ? { ...attemptState, can_continue: false, can_start: true, draft_id: null, revision_requested: true }
            : [{ ...fixture, status: 'returned', release_state: 'returned_for_revision' }],
      ),
    )
    const { result } = renderHook(() => useAssessmentAttempt(activityId), { wrapper })
    await waitFor(() => expect(result.current.vm?.surface).toBe('ATTEMPT'))
    const projection = result.current.vm
    if (projection?.surface !== 'ATTEMPT') throw new Error('Missing attempt projection')
    expect(projection.vm).toMatchObject({
      canStartRevision: true,
      recommendedAction: 'startRevision',
      timerExpiresAt: null,
      isResultVisible: false,
    })
  })

  it('writes keyed lowercase answers, quoted versions, and stable retry keys', async () => {
    vi.mocked(apiJson).mockImplementation(async (_path, _init, parse) => parse!(fixture))
    const answers = { [itemId]: { kind: 'OPEN_TEXT' as const, text: 'edited' } }
    const saved = await saveAssessmentDraft(submissionId, 3, answers)
    expect(saved.submission_uuid).toBe(submissionId)
    expect(saved.started_at).toBe('2026-05-05T12:00:00.000Z')
    const saveCall = vi.mocked(apiJson).mock.calls[0]!
    expect(saveCall[0]).toBe(`submissions/${submissionId}/draft`)
    expect(saveCall[1]?.headers).toMatchObject({ 'If-Match': '"3"' })
    expect(JSON.parse(String(saveCall[1]?.body))).toEqual({
      answers: { [itemId]: { kind: 'open_text', text: 'edited' } },
    })
    await submitAssessmentDraft(submissionId, 3, answers, 'one-logical-submit', 2)
    await submitAssessmentDraft(submissionId, 3, answers, 'one-logical-submit', 2)
    for (const call of vi.mocked(apiJson).mock.calls.slice(1)) {
      expect(call[0]).toBe(`submissions/${submissionId}/submit`)
      expect(call[1]?.headers).toMatchObject({ 'Idempotency-Key': 'one-logical-submit', 'If-Match': '"3"' })
      expect(JSON.parse(String(call[1]?.body)).violation_count).toBe(2)
    }
  })

  it.each(['TIME_LIMIT_EXPIRED', 'MAX_ATTEMPTS_REACHED', 'PAST_DUE'] as const)(
    'disables edits and submissions when blocked by %s',
    async reason => {
      vi.mocked(apiJson).mockImplementation(async (path, _init, parse) =>
        parse!(
          String(path).endsWith('/assessment')
            ? detail
            : String(path).endsWith('/attempt-state')
              ? { ...attemptState, can_continue: false, can_start: false, disabled_reasons: [reason] }
              : [fixture],
        ),
      )
      const { result } = renderHook(() => useAssessmentAttempt(activityId), { wrapper })
      await waitFor(() => expect(result.current.vm?.surface).toBe('ATTEMPT'))
      const projection = result.current.vm
      if (projection?.surface !== 'ATTEMPT') throw new Error('Missing attempt projection')
      expect(projection.vm).toMatchObject({
        canEdit: false,
        canSaveDraft: false,
        canSubmit: false,
        recommendedAction: 'blocked',
        disabledActionReasons: [reason],
      })
    },
  )

  it('refreshes attempt permissions after saving a draft', async () => {
    const invalidation = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    try {
      vi.mocked(apiJson).mockImplementation(async (path, _init, parse) =>
        parse!(String(path).endsWith('/me') ? [fixture] : fixture),
      )
      const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      act(() => result.current.save())
      await waitFor(() =>
        expect(invalidation).toHaveBeenCalledWith({ queryKey: ['assessments', 'attempt-state', assessmentId] }),
      )
    } finally {
      invalidation.mockRestore()
    }
  })

  // UX-061: the learner's open page polls a hand-in the teacher has not released
  // (10 s); the learner-state projection (passed/score headline) is refreshed
  // on that flip. UX-115: a released result keeps following the teacher every
  // 30 s, so a republished feedback reaches the open review without a reload.
  it('polls an awaiting hand-in until the grade is released, then every 30 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const invalidation = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    let listCalls = 0
    try {
      vi.mocked(apiJson).mockImplementation(async (path, _init, parse) => {
        if (String(path).endsWith('/assessment')) return parse!(detail)
        if (String(path).endsWith('/attempt-state')) {
          return parse!({ ...attemptState, can_continue: false, can_start: false, draft_id: null })
        }
        listCalls += 1
        const released = listCalls >= 3
        return parse!([
          {
            ...fixture,
            status: released ? 'published' : 'pending',
            release_state: released ? 'visible' : 'awaiting_release',
            // UX-121: the 4th poll carries a re-grade of the released attempt.
            final_score: released ? (listCalls >= 4 ? 100 : 86.67) : null,
          },
        ])
      })
      const { result } = renderHook(() => useAssessmentAttempt(activityId), { wrapper })
      await waitFor(() => expect(result.current.vm?.surface).toBe('ATTEMPT'))
      expect(result.current.vm).toMatchObject({ vm: { recommendedAction: 'waitForRelease' } })
      await act(() => vi.advanceTimersByTimeAsync(10_500))
      expect(listCalls).toBe(2)
      await act(() => vi.advanceTimersByTimeAsync(10_500))
      await waitFor(() => expect(result.current.vm).toMatchObject({ vm: { recommendedAction: 'viewResult' } }))
      expect(invalidation).toHaveBeenCalledWith({ queryKey: ['learner-course'] })
      await act(() => vi.advanceTimersByTimeAsync(20_000))
      expect(listCalls).toBe(3)
      await act(() => vi.advanceTimersByTimeAsync(10_500))
      expect(listCalls).toBe(4)
      const projectionInvalidations = () =>
        invalidation.mock.calls.filter(([filters]) => filters?.queryKey?.[0] === 'learner-course').length
      await waitFor(() => expect(projectionInvalidations()).toBe(2))
    } finally {
      invalidation.mockRestore()
      vi.useRealTimers()
    }
  })

  it('treats only missing drafts as empty and propagates access failures', async () => {
    vi.mocked(apiJson).mockRejectedValueOnce(new APIError({ code: 'not-found', status: 404, message: 'No draft' }))
    expect(await getAssessmentDraft(assessmentId)).toBeNull()
    vi.mocked(apiJson).mockRejectedValueOnce(new APIError({ code: 'forbidden', status: 403, message: 'Denied' }))
    await expect(getAssessmentDraft(assessmentId)).rejects.toThrow('Denied')
  })

  it('refetches a conflicting draft without overwriting local edits', async () => {
    const latest = { ...fixture, draft_version: 4, answers: { [itemId]: { kind: 'open_text', text: 'other tab' } } }
    vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
      if (init?.method === 'PATCH')
        throw new APIError({ code: 'conflict', status: 409, message: 'Stale', details: { expected: 3, actual: 4 } })
      return parse!(
        String(path).endsWith('/me') ? [fixture] : path === `submissions/${submissionId}` ? latest : fixture,
      )
    })
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.setItemAnswer(itemId, { kind: 'OPEN_TEXT', text: 'local work' }))
    act(() => result.current.save())
    await waitFor(() => expect(result.current.saveState).toBe('conflict'))
    expect(result.current.answers[itemId]).toEqual({ kind: 'OPEN_TEXT', text: 'local work' })
    expect(result.current.conflict?.latestVersion).toBe(4)
    act(() => result.current.conflict?.onUseServerVersion())
    expect(result.current.answers[itemId]).toEqual({ kind: 'OPEN_TEXT', text: 'other tab' })
  })

  // BUG-238: a draft behind the assessment's content is re-opened (the server
  // re-syncs it) and the items reload — never the draft-conflict dialog.
  it('reopens a draft the teacher changed under it instead of a conflict', async () => {
    const starts: string[] = []
    let itemGets = 0
    let changed = false
    const added = { ...detail.items[0]!, id: '00000000-0000-4000-8000-000000000005', position: 2 }
    vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
      const p = String(path)
      if (p.endsWith('/submit')) {
        changed = true
        throw new APIError({
          code: 'conflict',
          status: 409,
          message: 'Stale content',
          details: { field: 'content_version', expected: 1, actual: 2 },
        })
      }
      if (init?.method === 'POST') starts.push(p)
      if (p.endsWith('/assessment')) {
        itemGets += 1
        return parse!(changed ? { ...detail, content_version: 3, items: [...detail.items, added] } : detail)
      }
      if (p.endsWith('/attempt-state')) return parse!(attemptState)
      return parse!(p.endsWith('/me') ? [fixture] : fixture)
    })
    // The exam page: items from `useAssessmentAttempt` (keyed by activity),
    // submit from the hook (keyed by assessment) — the re-sync must reach them.
    const { result } = renderHook(
      () => ({
        attempt: useAssessmentAttempt(activityId),
        submission: useAssessmentSubmission(assessmentId),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.submission.isLoading).toBe(false))
    const items = () => {
      const projection = result.current.attempt.vm
      return projection?.surface === 'ATTEMPT' ? projection.vm.items : undefined
    }
    await waitFor(() => expect(items()).toHaveLength(1))
    act(() => result.current.submission.setItemAnswer(itemId, { kind: 'OPEN_TEXT', text: 'local work' }))
    let itemGetsAtSettle = 0
    act(
      () =>
        void result.current.submission
          .submit()
          .catch(() => undefined)
          .then(() => {
            itemGetsAtSettle = itemGets
          }),
    )
    await waitFor(() => expect(itemGetsAtSettle).toBeGreaterThan(0))
    expect(toast.warning).toHaveBeenCalledWith('assessmentChanged')
    // The items were refetched before the submit settled (the learner cannot
    // submit again on the old list); the page now shows the added question.
    expect(itemGetsAtSettle).toBe(2)
    await waitFor(() => expect(items()).toHaveLength(2))
    expect(starts).toEqual([`assessments/${assessmentId}/submissions`])
    expect(result.current.submission.conflict).toBeNull()
    expect(result.current.submission.saveState).toBe('dirty')
    expect(result.current.submission.answers[itemId]).toEqual({ kind: 'OPEN_TEXT', text: 'local work' })
  })
})
