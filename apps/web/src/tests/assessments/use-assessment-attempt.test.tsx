import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useAssessmentAttempt } from '@/features/assessments/shell/hooks/useAssessmentAttempt'
import { reportClientError } from '@/services/telemetry/client'

vi.mock('@/services/telemetry/client', () => ({
  reportClientError: vi.fn().mockResolvedValue(undefined),
}))

describe('useAssessmentAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports local draft persistence failure after quota cleanup retry fails', async () => {
    const quotaError = new Error('quota exceeded')
    quotaError.name = 'QuotaExceededError'
    vi.stubGlobal('localStorage', {
      get length() {
        return 0
      },
      clear: vi.fn(),
      getItem: vi.fn(),
      key: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw quotaError
      }),
    })

    const { result } = renderHook(() =>
      useAssessmentAttempt({
        attemptUuid: 'attempt-1',
        autoSaveInterval: 0,
      }),
    )

    act(() => {
      result.current.saveAnswers({ item_one: { kind: 'OPEN_TEXT', text: 'draft' } })
    })

    await waitFor(() => {
      expect(reportClientError).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptUuid: 'attempt-1',
          phase: 'persist-local-attempt',
          scope: 'assessment-flow',
        }),
      )
    })
  })
})
