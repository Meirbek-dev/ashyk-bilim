/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { apiJson } from '@/lib/api-client'
import type { StudentSubmission } from '@/lib/api/generated/zod'
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/services/telemetry/client', () => ({ reportClientError: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const assessmentId = '00000000-0000-4000-8000-000000000001'
const submissionId = '00000000-0000-4000-8000-000000000002'
const itemId = '00000000-0000-4000-8000-000000000003'
const submitted: StudentSubmission = {
  id: submissionId,
  assessment_id: assessmentId,
  status: 'published',
  release_state: 'visible',
  answers: { [itemId]: { kind: 'choice', selected: ['a'] } },
  answered_count: 1,
  total_items: 1,
  attempt_number: 1,
  draft_version: 2,
  is_late: false,
  violation_count: 0,
  auto_score: 100,
  final_score: 100,
  started_at_unix: 1777982400,
  submitted_at_unix: 1777982500,
}
const draft: StudentSubmission = {
  ...submitted,
  status: 'draft',
  release_state: 'hidden',
  auto_score: null,
  final_score: null,
}

beforeEach(() => vi.resetAllMocks())

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('draft query gating', () => {
  it('never asks for submissions/draft when the attempt list has no open draft (no 404 on every submit)', async () => {
    vi.mocked(apiJson).mockImplementation(async (path, _init, parse) => {
      if (String(path).endsWith('/me')) return parse!([submitted])
      throw new Error(`unexpected call ${String(path)}`)
    })
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.draft).toBeNull()
    expect(result.current.submission?.submission_uuid).toBe(submissionId)
    expect(vi.mocked(apiJson).mock.calls.map(call => String(call[0]))).not.toContain(
      `assessments/${assessmentId}/submissions/draft`,
    )
  })

  it('fetches the draft once the attempt list reports one', async () => {
    vi.mocked(apiJson).mockImplementation(async (path, _init, parse) =>
      parse!(String(path).endsWith('/me') ? [draft] : draft),
    )
    const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
    await waitFor(() => expect(result.current.draft?.submission_uuid).toBe(submissionId))
    expect(vi.mocked(apiJson).mock.calls.map(call => String(call[0]))).toContain(
      `assessments/${assessmentId}/submissions/draft`,
    )
  })

  it('refreshes the learner-state projection after a submit', async () => {
    const invalidation = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    try {
      vi.mocked(apiJson).mockImplementation(async (path, init, parse) => {
        if (String(path).endsWith('/me')) return parse!([draft])
        if (String(path).endsWith('/submit') && init?.method === 'POST') return parse!(submitted)
        return parse!(draft)
      })
      const { result } = renderHook(() => useAssessmentSubmission(assessmentId), { wrapper })
      await waitFor(() => expect(result.current.draft?.submission_uuid).toBe(submissionId))
      await act(async () => {
        await result.current.submit()
      })
      expect(invalidation).toHaveBeenCalledWith({ queryKey: ['learner-course'] })
    } finally {
      invalidation.mockRestore()
    }
  })
})
