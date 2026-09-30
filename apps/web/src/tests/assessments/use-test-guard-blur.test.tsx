import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useTestGuard } from '@/hooks/useTestGuard'

// BUG-136: the caller passes a new `onViolation` lambda on every render (a 1 Hz
// timer re-renders the attempt); the guard must not re-subscribe — its cleanup
// cancelled the pending blur debounce, so most tab switches were never reported.
describe('useTestGuard blur reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reports every blur even when onViolation changes identity each render', () => {
    const reports: number[] = []
    const { rerender } = renderHook(() =>
      useTestGuard({
        onViolation: (_type, count) => reports.push(count),
        maxViolations: 999,
        trackDevTools: false,
        preventCopy: false,
        preventRightClick: false,
        blurDebounceMs: 500,
      }),
    )

    for (let i = 0; i < 8; i += 1) {
      act(() => {
        window.dispatchEvent(new Event('blur'))
      })
      // A re-render mid-debounce (new lambda identity) must not cancel the report.
      act(() => rerender())
      act(() => vi.advanceTimersByTime(600))
    }

    expect(reports).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
