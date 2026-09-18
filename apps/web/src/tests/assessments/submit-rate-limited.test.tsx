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
// goes through the localized mapper — a 429 with `Retry-After` says when.

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}.${key}:${JSON.stringify(values)}` : `${ns}.${key}`
    t.has = (key: string) => key === 'codes.rate-limited' || key === 'rateLimitedRetry'
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
}
beforeEach(() => vi.resetAllMocks())

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('submit rate limited', () => {
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
    expect(message).toBe('Errors.rateLimitedRetry:{"minutes":1}')
    expect(String(message)).not.toContain('slow down')
  })
})
