import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'
import { apiJson } from '@/lib/api-client'
import { APIError } from '@/lib/api/assertSuccess'
import type { StudentSubmission } from '@/lib/api/generated/zod'
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission'

// BUG-212 nit: the connection dropped after the server took the submit. The
// form used to stay open («Сохранено») while the history already listed the
// published attempt; now the hook re-reads the attempt and shows the result.

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
const published = { ...draft, status: 'published', release_state: 'visible', final_score: 100 }
const offline = () => new APIError({ code: 'NETWORK_UNAVAILABLE', status: 0, message: 'offline' })
beforeEach(() => vi.resetAllMocks())

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('submit whose reply was lost to a network drop', () => {
  it('shows the landed result instead of keeping the form open', async () => {
    let landed = false
    vi.mocked(apiJson).mockImplementation(async (path, _init, parse) => {
      const url = String(path)
      if (url.endsWith('/submit')) {
        landed = true
        throw offline()
      }
      if (url.endsWith('/me')) return parse!([landed ? published : draft])
      return parse!(landed ? published : draft)
    })
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.draft?.status).toBe('DRAFT')
    await act(async () => {
      await result.current.submit()
    })
    await waitFor(() => expect(result.current.status).toBe('PUBLISHED'))
    expect(result.current.draft).toBeNull()
    expect(result.current.saveState).toBe('saved')
    expect(toast.error).not.toHaveBeenCalled()
  }, 10_000)
})
