/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'
import { APIError } from '@/lib/api/assertSuccess'
import { useApiError } from '@/hooks/useApiError'

// UX-244: field errors bound inline are the message - no second toast that outlives a later save.

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() } }))
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.has = () => true
    return t
  },
}))

const invalidName = () =>
  new APIError({
    code: 'validation-failed',
    status: 422,
    message: 'invalid',
    fieldErrors: [{ field: 'name', code: 'required', message: 'required' }],
  })

describe('useApiError with a form', () => {
  it('binds field errors inline and closes the loading toast instead of adding an error toast', () => {
    const setError = vi.fn()
    const { result } = renderHook(() => useApiError())
    result.current.toastApiError(invalidName(), { setError, toastId: 'saving' })
    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'fields.required' })
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.dismiss).toHaveBeenCalledWith('saving')
  })

  it('still toasts when there is no form to bind to', () => {
    const { result } = renderHook(() => useApiError())
    result.current.toastApiError(invalidName())
    expect(toast.error).toHaveBeenCalled()
  })

  // UX-292/293: an unbound 422 names what failed (the caller's fallback), never the English title.
  it('toasts the caller fallback for a 422 with nothing to highlight', () => {
    vi.mocked(toast.error).mockClear()
    const { result } = renderHook(() => useApiError())
    result.current.toastApiError(invalidName(), { fallback: 'reorder failed' })
    expect(toast.error).toHaveBeenCalledWith('reorder failed', {})
  })

  // BUG-B5: the positional form `toastApiError(error, undefined, fallback)` dropped the fallback.
  it('keeps the fallback passed positionally after an undefined form', () => {
    vi.mocked(toast.error).mockClear()
    const { result } = renderHook(() => useApiError())
    result.current.toastApiError(invalidName(), undefined, 'activity not created')
    expect(toast.error).toHaveBeenCalledWith('activity not created', {})
  })
})
