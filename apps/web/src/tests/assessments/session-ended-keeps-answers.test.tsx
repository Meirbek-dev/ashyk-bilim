import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'
import { apiJson } from '@/lib/api-client'
import { APIError } from '@/lib/api/assertSuccess'
import type { StudentSubmission } from '@/lib/api/generated/zod'
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission'

// UX-212: the session ended mid-attempt (cap eviction, logout elsewhere). The
// autosave's 401 keeps the unsaved answer in this tab and says so; back from
// the login page the answer is restored and saved.

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = (key: string) => `${ns}.${key}`
    t.has = () => false
    return t
  },
}))
vi.mock('@/services/telemetry/client', () => ({ reportClientError: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const assessmentId = '00000000-0000-4000-8000-000000000011'
const submissionId = '00000000-0000-4000-8000-000000000012'
const itemId = '00000000-0000-4000-8000-000000000013'
const draft: StudentSubmission = {
  id: submissionId,
  assessment_id: assessmentId,
  status: 'draft',
  release_state: 'hidden',
  answers: { [itemId]: { kind: 'open_text', text: 'old' } },
  answered_count: 1,
  total_items: 1,
  attempt_number: 1,
  draft_version: 2,
  is_late: false,
  violation_count: 0,
  started_at_unix: 1777982400,
}
const changed = { [itemId]: { kind: 'OPEN_TEXT' as const, text: 'Алматы' } }
const changedWire = { [itemId]: { kind: 'open_text', text: 'Алматы' } }

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
})

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('a save refused because the session ended', () => {
  it('keeps the answer, says so, and restores + saves it on return', async () => {
    let signedIn = false
    const saved: unknown[] = []
    vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
      const url = String(path)
      if (url.endsWith('/draft') && init?.method === 'PATCH') {
        if (!signedIn) throw new APIError({ code: 'unauthenticated', status: 401, message: 'no session' })
        const body = JSON.parse(String(init.body)) as { answers: unknown }
        saved.push(body.answers)
        return parse!({ ...draft, answers: body.answers, draft_version: 3 })
      }
      if (url.endsWith('/me')) return parse!([draft])
      return parse!(draft)
    })

    const first = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    act(() => first.result.current.setItemAnswer(itemId, changed[itemId]))
    act(() => first.result.current.save())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Features.ActivityWorkspace.sessionEnded'))
    expect(first.result.current.saveState).toBe('dirty')
    first.unmount()

    signedIn = true
    const back = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(saved).toEqual([changedWire]))
    expect(back.result.current.answers).toEqual(changed)
    expect(toast.info).toHaveBeenCalledWith('Features.ActivityWorkspace.sessionEndedRestored')
    await waitFor(() => expect(back.result.current.saveState).toBe('saved'))
    expect(sessionStorage.length).toBe(0)
  }, 10_000)
})
