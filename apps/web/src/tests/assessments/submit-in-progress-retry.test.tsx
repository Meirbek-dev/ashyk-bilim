import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'
import { apiJson } from '@/lib/api-client'
import { APIError } from '@/lib/api/assertSuccess'
import type { StudentSubmission } from '@/lib/api/generated/zod'
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission'

// BUG-204: a submit answered 409 `idempotency-in-progress` used to reuse the
// same key forever (unchanged fingerprint) and open the draft-conflict dialog.
// Now the hook waits, re-reads the submission, and either takes the landed
// result or submits again under a fresh key.

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = (key: string) => `${ns}.${key}`
    t.has = () => false
    return t
  },
}))
vi.mock('@/services/telemetry/client', () => ({ reportClientError: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const assessmentId = '00000000-0000-4000-8000-000000000001'
const submissionId = '00000000-0000-4000-8000-000000000002'
const itemId = '00000000-0000-4000-8000-000000000003'
const draft: StudentSubmission = {
  id: submissionId,
  assessment_id: assessmentId,
  status: 'draft',
  release_state: 'hidden',
  answers: { [itemId]: { kind: 'open_text', text: 'server' } },
  answered_count: 1,
  total_items: 1,
  attempt_number: 1,
  draft_version: 2,
  is_late: false,
  violation_count: 0,
  started_at_unix: 1777982400,
}
const inProgress = () =>
  new APIError({ code: 'idempotency-in-progress', status: 409, message: 'still being processed' })
beforeEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
})

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const submitCalls = () => vi.mocked(apiJson).mock.calls.filter(([path]) => String(path).endsWith('/submit'))
const keyOf = (call: Parameters<typeof apiJson>) => (call[1]!.headers as Record<string, string>)['Idempotency-Key']

describe('submit while the previous submit is still in progress', () => {
  it('retries under a fresh key when the draft is still open, without the conflict dialog', async () => {
    vi.mocked(apiJson).mockImplementation(async (path, _init, parse) => {
      if (String(path).endsWith('/submit')) {
        if (submitCalls().length === 1) throw inProgress()
        return parse!({ ...draft, status: 'published', release_state: 'visible' })
      }
      return parse!(String(path).endsWith('/me') ? [draft] : draft)
    })
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.submit()
    })
    const calls = submitCalls()
    expect(calls).toHaveLength(2)
    expect(keyOf(calls[0]!)).toBeTruthy()
    expect(keyOf(calls[1]!)).not.toBe(keyOf(calls[0]!))
    expect(result.current.conflict).toBeNull()
    expect(result.current.saveState).toBe('saved')
    expect(toast.error).not.toHaveBeenCalled()
  }, 10_000)

  it('takes the landed submission instead of submitting twice when the first one finished', async () => {
    vi.mocked(apiJson).mockImplementation(async (path, _init, parse) => {
      if (String(path).endsWith('/submit')) throw inProgress()
      if (String(path).endsWith(`submissions/${submissionId}`))
        return parse!({ ...draft, status: 'published', release_state: 'visible', final_score: 100 })
      return parse!(String(path).endsWith('/me') ? [draft] : draft)
    })
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.submit()
    })
    expect(submitCalls()).toHaveLength(1)
    expect(result.current.conflict).toBeNull()
    expect(result.current.saveState).toBe('saved')
    expect(toast.error).not.toHaveBeenCalled()
  }, 10_000)
})
