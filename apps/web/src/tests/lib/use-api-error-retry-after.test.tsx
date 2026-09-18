/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'
import { APIError } from '@/lib/api/assertSuccess'
import { useApiError } from '@/hooks/useApiError'

// UX-101: a 429 that carries its window (`Retry-After` or
// `details.retry_after_seconds`) says «через N минут» instead of the generic
// «Слишком много запросов. Попробуйте позже.» — the login banner already did.

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key
    t.has = (key: string) => ['rateLimited', 'rateLimitedRetry', 'codes.rate-limited'].includes(key)
    return t
  },
}))

describe('useApiError on a 429', () => {
  it('tells the minutes from details.retry_after_seconds', () => {
    const { result } = renderHook(() => useApiError())
    result.current.toastApiError(
      new APIError({ code: 'rate-limited', status: 429, message: 'slow down', details: { retry_after_seconds: 700 } }),
    )
    expect(toast.error).toHaveBeenLastCalledWith('rateLimitedRetry:{"minutes":12}', expect.anything())
  })

  it('tells the minutes from Retry-After and keeps the generic copy without a window', () => {
    const { result } = renderHook(() => useApiError())
    result.current.toastApiError(
      new APIError({ code: 'rate-limited', status: 429, message: 'slow down', headers: { 'retry-after': '30' } }),
    )
    expect(toast.error).toHaveBeenLastCalledWith('rateLimitedRetry:{"minutes":1}', expect.anything())
    result.current.toastApiError(new APIError({ code: 'rate-limited', status: 429, message: 'slow down' }))
    expect(toast.error).toHaveBeenLastCalledWith('codes.rate-limited', expect.anything())
  })
})
