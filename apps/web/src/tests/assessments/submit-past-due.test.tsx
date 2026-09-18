import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'
import { apiJson } from '@/lib/api-client'
import { APIError } from '@/lib/api/assertSuccess'
import type { StudentSubmission } from '@/lib/api/generated/zod'
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission'

// UX-103: the due date passes inside an open attempt (`allow_late: false`) —
// the submit 403 names a `DisabledReason` («cannot submit: PAST_DUE»). The
// hook must refetch attempt-state (the blocked card replaces the attempt)
// and toast the localized reason, not the raw «PAST_DUE» / «Ошибка сохранения».

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = (key: string) => `${ns}.${key}`
    t.has = (key: string) => key === 'PAST_DUE'
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

describe('submit past due', () => {
  it('refetches attempt-state and toasts the localized reason on a DisabledReason 403', async () => {
    const invalidation = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    try {
      vi.mocked(apiJson).mockImplementation(async (path, _init, parse) => {
        if (String(path).endsWith('/submit'))
          throw new APIError({ code: 'forbidden', status: 403, message: 'cannot submit: PAST_DUE' })
        return parse!(String(path).endsWith('/me') ? [fixture] : fixture)
      })
      const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      await act(async () => {
        await result.current.submit().catch(() => undefined)
      })
      await waitFor(() =>
        expect(invalidation).toHaveBeenCalledWith({ queryKey: ['assessments', 'attempt-state', assessmentId] }),
      )
      expect(toast.error).toHaveBeenCalledWith('AttemptActions.blockedReasons.PAST_DUE')
      expect(result.current.saveState).not.toBe('error')
    } finally {
      invalidation.mockRestore()
    }
  })
})
