import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'
import { apiJson } from '@/lib/api-client'
import { APIError } from '@/lib/api/assertSuccess'
import type { StudentSubmission } from '@/lib/api/generated/zod'
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission'

// UX-111: a submit 429 used to toast the server's English detail («too many
// submit attempts; slow down»). Every non-conflict, non-reason failure now
// goes through the localized mapper - a 429 with `Retry-After` says when.

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}.${key}:${JSON.stringify(values)}` : `${ns}.${key}`
    t.has = (key: string) =>
      key === 'codes.rate-limited' || key === 'rateLimitedRetry' || key === 'rateLimitedRetrySeconds'
    return t
  },
}))
vi.mock('@/services/telemetry/client', () => ({ reportClientError: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const assessmentId = '00000000-0000-4000-8000-000000000001'
const submissionId = '00000000-0000-4000-8000-000000000002'
const itemId = '00000000-0000-4000-8000-000000000003'
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
  auto_score: null,
  auto_submit_reason: null,
  final_score: null,
  graded_at_unix: null,
  grading: null,
  late_penalty_pct: null,
  submitted_at_unix: null,
  time_remaining_seconds: null,
  time_remaining_reason: null,
}
beforeEach(() => vi.resetAllMocks())

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('assessment submission recovery', () => {
  it.each(['save', 'submit'])('ignores a delayed conflict recovery for an earlier %s', async action => {
    const otherAssessmentId = '00000000-0000-4000-8000-000000000004'
    let finishRecovery!: () => void
    vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
      if (String(path).endsWith('/submit') || init?.method === 'PATCH') {
        throw new APIError({ code: 'conflict', status: 409, message: 'draft changed' })
      }
      if (String(path).endsWith(submissionId)) {
        await new Promise<void>(resolve => {
          finishRecovery = resolve
        })
        return parse!(fixture)
      }
      const draft = String(path).includes(otherAssessmentId)
        ? { ...fixture, assessment_id: otherAssessmentId, id: otherAssessmentId }
        : fixture
      return parse!(String(path).endsWith('/me') ? [draft] : draft)
    })
    const { result, rerender } = renderHook(({ id }) => useAssessmentSubmission(id), {
      wrapper,
      initialProps: { id: assessmentId },
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let submitting: Promise<unknown> | undefined
    act(() => {
      if (action === 'submit') submitting = result.current.submit().catch(() => undefined)
      else result.current.save()
    })
    await waitFor(() => expect(finishRecovery).toBeDefined())
    rerender({ id: otherAssessmentId })
    await waitFor(() => expect(result.current.draft?.assessment_id).toBe(otherAssessmentId))
    act(() => result.current.setItemAnswer(itemId, { kind: 'OPEN_TEXT', text: 'new answer' }))
    await act(async () => {
      finishRecovery()
      await submitting
    })
    await waitFor(() => expect(result.current.isSaving || result.current.isSubmitting).toBe(false))
    expect(result.current.saveState).toBe('dirty')
    expect(result.current.answers[itemId]).toEqual({ kind: 'OPEN_TEXT', text: 'new answer' })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not submit a different assessment after waiting for a previous autosave', async () => {
    const otherAssessmentId = '00000000-0000-4000-8000-000000000004'
    let finishSave!: () => void
    vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
      if (init?.method === 'PATCH') {
        await new Promise<void>(resolve => {
          finishSave = resolve
        })
      }
      const draft = String(path).includes(otherAssessmentId)
        ? { ...fixture, assessment_id: otherAssessmentId, id: otherAssessmentId }
        : fixture
      return parse!(String(path).endsWith('/me') ? [draft] : draft)
    })
    const { result, rerender } = renderHook(({ id }) => useAssessmentSubmission(id), {
      wrapper,
      initialProps: { id: assessmentId },
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.save())
    await waitFor(() => expect(finishSave).toBeDefined())
    let submitting!: Promise<unknown>
    act(() => {
      submitting = result.current.submit().catch(() => undefined)
    })
    await waitFor(() => expect(result.current.isSubmitting).toBe(true))
    rerender({ id: otherAssessmentId })
    await waitFor(() => expect(result.current.draft?.assessment_id).toBe(otherAssessmentId))
    await act(async () => {
      finishSave()
      await submitting
    })
    expect(vi.mocked(apiJson).mock.calls.some(([path]) => String(path).endsWith('/submit'))).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it.each([
    ['submit', 'success'],
    ['submit', 'error'],
    ['save', 'success'],
    ['save', 'error'],
  ])('keeps another assessment unchanged when an earlier %s ends with %s', async (action, outcome) => {
    const otherAssessmentId = '00000000-0000-4000-8000-000000000004'
    let finishSubmit!: () => void
    vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
      if (String(path).endsWith('/submit') || init?.method === 'PATCH') {
        await new Promise<void>(resolve => {
          finishSubmit = resolve
        })
        if (outcome === 'error') {
          throw new APIError({ code: 'rate-limited', status: 429, message: 'slow down' })
        }
        return parse!({ ...fixture, status: action === 'submit' ? 'pending' : 'draft' })
      }
      const draft = String(path).includes(otherAssessmentId)
        ? { ...fixture, assessment_id: otherAssessmentId, id: otherAssessmentId }
        : fixture
      return parse!(String(path).endsWith('/me') ? [draft] : draft)
    })
    const { result, rerender } = renderHook(({ id }) => useAssessmentSubmission(id), {
      wrapper,
      initialProps: { id: assessmentId },
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let submitting: ReturnType<typeof result.current.submit> | undefined
    act(() => {
      if (action === 'submit') submitting = result.current.submit()
      else result.current.save()
    })
    await waitFor(() => expect(finishSubmit).toBeDefined())
    rerender({ id: otherAssessmentId })
    await waitFor(() => expect(result.current.draft?.assessment_id).toBe(otherAssessmentId))
    act(() => result.current.setItemAnswer(itemId, { kind: 'OPEN_TEXT', text: 'new assessment answer' }))
    await act(async () => {
      finishSubmit()
      await submitting?.catch(() => undefined)
    })
    await waitFor(() => expect(result.current.isSaving || result.current.isSubmitting).toBe(false))
    expect(result.current.answers[itemId]).toEqual({ kind: 'OPEN_TEXT', text: 'new assessment answer' })
    expect(result.current.saveState).toBe('dirty')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('restarts draft recovery after cancelling a throttled save for a failed submit', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000)
    vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
      if (String(path).endsWith('/submit')) {
        throw new APIError({ code: 'rate-limited', status: 429, message: 'slow down' })
      }
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body))
        return parse!({ ...fixture, answers: body.answers, draft_version: 4 })
      }
      return parse!(String(path).endsWith('/me') ? [fixture] : fixture)
    })
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    try {
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      act(() => result.current.setItemAnswer(itemId, { kind: 'OPEN_TEXT', text: 'first save' }))
      act(() => result.current.save())
      await waitFor(() => expect(result.current.saveState).toBe('saved'))
      act(() => result.current.setItemAnswer(itemId, { kind: 'OPEN_TEXT', text: 'latest answer' }))
      act(() => result.current.save())
      now.mockReturnValue(105_000)
      await act(async () => {
        await result.current.submit().catch(() => undefined)
      })
      await waitFor(() => expect(result.current.saveState).toBe('saved'))
      const saves = vi.mocked(apiJson).mock.calls.filter(([, init]) => init?.method === 'PATCH')
      expect(saves).toHaveLength(2)
      expect(String(saves[1]![1]!.body)).toContain('latest answer')
    } finally {
      now.mockRestore()
    }
  })

  it('toasts the localized rate-limit copy with the Retry-After window, not the English detail', async () => {
    vi.mocked(apiJson).mockImplementation(async (path, _init, parse) => {
      if (String(path).endsWith('/submit'))
        throw new APIError({
          code: 'rate-limited',
          status: 429,
          message: 'too many submit attempts; slow down',
          headers: { 'retry-after': '8' },
        })
      return parse!(String(path).endsWith('/me') ? [fixture] : fixture)
    })
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.submit().catch(() => undefined)
    })
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const [message] = vi.mocked(toast.error).mock.calls[0]!
    // UX-121: an 8 s window is «через 8 с», not «через 1 минуту».
    expect(message).toBe('Errors.rateLimitedRetrySeconds:{"seconds":8}')
    expect(String(message)).not.toContain('slow down')
  })

  // BUG-178: answers typed inside the autosave throttle used to die with a
  // failed submit - the draft PATCH must follow with the typed answers and
  // the attempt stays «Не сохранено» until it lands.
  it('re-queues the unsaved answers as a draft save when the submit fails', async () => {
    vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
      if (String(path).endsWith('/submit'))
        throw new APIError({
          code: 'rate-limited',
          status: 429,
          message: 'slow down',
          headers: { 'retry-after': '10' },
        })
      if (init?.method === 'PATCH') return parse!({ ...fixture, draft_version: 4 })
      return parse!(String(path).endsWith('/me') ? [fixture] : fixture)
    })
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.setItemAnswer(itemId, { kind: 'OPEN_TEXT', text: 'typed' }))
    await act(async () => {
      await result.current.submit().catch(() => undefined)
    })
    expect(result.current.saveState).toBe('dirty')
    await waitFor(() => {
      const draftSave = vi.mocked(apiJson).mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(draftSave).toBeDefined()
      expect(String(draftSave![1]!.body)).toContain('"typed"')
    })
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
  })
})
