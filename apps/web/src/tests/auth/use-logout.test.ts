/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { performLogout } from '@/lib/auth/use-logout'

const mockLogout = vi.fn()
vi.mock('@services/auth/auth', () => ({
  logout: (...args: unknown[]) => mockLogout(...args),
}))

// The shared test setup (src/tests/setup.ts) replaces `next/navigation`
// wholesale without `unstable_rethrow` — restore the real implementation
// here since it's exactly what this test is verifying gets used.
vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return { ...actual }
})

/**
 * Shape of the internal error `redirect()` throws inside a Server Action
 * (`next/dist/client/components/redirect-error.js`): a `digest` of
 * `NEXT_REDIRECT;<push|replace>;<destination>;<statusCode>;` marks it as
 * Next's own navigation signal, not an application error — it must reach
 * the framework unhandled for the browser to actually navigate.
 */
function redirectSignal(): Error {
  return Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/login;307;' })
}

describe('performLogout (BUG-009: sidebar logout was a dead click)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lets a Next.js redirect signal from logout() propagate instead of swallowing it', async () => {
    // This is the actual, every-time path: logoutAction() always ends in a
    // redirect(), so logout() always rejects with this signal on success.
    // The old DashSidebar handler did `catch (error) { console.error(...) }`
    // unconditionally — swallowing this on every single click, so the
    // browser never navigated and the click looked like a total no-op.
    mockLogout.mockRejectedValueOnce(redirectSignal())
    const onFailure = vi.fn()

    await expect(performLogout(onFailure)).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;push;/login;307;' })
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('surfaces a genuine logout failure instead of failing silently', async () => {
    mockLogout.mockRejectedValueOnce(new Error('network down'))
    const onFailure = vi.fn()

    await performLogout(onFailure)

    expect(onFailure).toHaveBeenCalledOnce()
  })
})
