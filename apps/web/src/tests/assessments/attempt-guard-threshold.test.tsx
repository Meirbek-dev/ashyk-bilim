/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import { useAttemptGuard } from '@/features/assessments/shared/hooks/useAttemptGuard'

const mocks = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}` }))

// UX-087: the server zeroes any submit at or past the threshold, so the guard
// forfeits and hands in at once — no 10 s «refocus to resume» grace.
describe('useAttemptGuard at the violation threshold', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('forfeits immediately, once, and says so', () => {
    const onThresholdReached = vi.fn()
    const policy = {
      ...DEFAULT_POLICY_VIEW,
      antiCheat: { ...DEFAULT_POLICY_VIEW.antiCheat, tabSwitchDetection: true, violationThreshold: 2 },
    }
    renderHook(() => useAttemptGuard(policy, { onThresholdReached }))
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        window.dispatchEvent(new Event('blur'))
      })
      act(() => vi.advanceTimersByTime(600))
    }
    expect(onThresholdReached).toHaveBeenCalledTimes(1)
    expect(onThresholdReached).toHaveBeenCalledWith('SECURITY_LIMIT_EXCEEDED', 2)
    expect(mocks.toast.error).toHaveBeenCalledWith('violationThresholdForfeited:{"count":2}')
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})
