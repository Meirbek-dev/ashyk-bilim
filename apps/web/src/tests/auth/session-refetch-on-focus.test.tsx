/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vite-plus/test'
import { act, renderHook, waitFor } from '@testing-library/react'
import { SessionProvider, useSessionContext } from '@/components/providers/session-provider'
import type { Session } from '@/lib/auth/types'
import type React from 'react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dash',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }))
const apiJson = vi.fn()
vi.mock('@/lib/api-client', () => ({ apiJson: (...args: unknown[]) => apiJson(...args) }))

const userId = '0198c0ae-0000-7000-8000-000000000001'
const session: Session = {
  user: {
    id: userId,
    username: 'beta',
    email: 'b@x.kz',
    display_name: 'Beta',
    bio: '',
    locale: 'ru-RU',
    avatar_key: null,
    mfa_enabled: false,
  },
  userId,
  roles: ['instructor'],
  permissions: ['analytics:read:own'],
}
const wire = (permissions: string[], roles: string[]) => ({ user_id: userId, roles, permissions, mfa_enabled: false })

describe('UX-076 session grants follow the server', () => {
  it('drops a revoked permission after a window focus re-probe of auth/session', async () => {
    apiJson.mockImplementation(async (_p: string, _i: unknown, parse: (d: unknown) => unknown) =>
      parse(wire(session.permissions, session.roles)),
    )
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider initialSession={session}>{children}</SessionProvider>
    )
    const { result } = renderHook(() => useSessionContext(), { wrapper })
    await waitFor(() => expect(apiJson).toHaveBeenCalledWith('auth/session', {}, expect.any(Function)))
    expect(result.current.can('analytics', 'read', 'own')).toBe(true)

    apiJson.mockImplementation(async (_p: string, _i: unknown, parse: (d: unknown) => unknown) =>
      parse(wire([], ['user'])),
    )
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(result.current.can('analytics', 'read', 'own')).toBe(false))
    expect(result.current.session?.roles).toEqual(['user'])
  })
})
