/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Users from '@/components/Dashboard/Pages/Users/Users/Users'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { loading: () => 'toast-1', success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ session: { roles: ['admin'], permissions: ['*:*:*'] }, user: { id: 'me' }, can: () => true }),
}))
const setUserStatus = vi.fn(async () => {})
vi.mock('@/services/rbac', () => ({ setUserStatus: (...args: unknown[]) => setUserStatus(...args) }))
const row = (id: string, status: string) => ({
  id, username: id, email: `${id}@x.kz`, display_name: id, status, roles: ['user'],
})
vi.mock('@/features/users/hooks/useUsers', () => ({
  useAllMembers: () => ({ data: [row('alpha', 'active'), row('beta', 'disabled')], isLoading: false, isError: false }),
  useRoles: () => ({ data: [] }),
}))

afterEach(cleanup)

describe('UX-071 settings users list: disable, not delete', () => {
  it('lists disabled users with «Включить» and PATCHes status instead of deleting', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Users />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('statusDisabled')).toBeTruthy()
    expect(screen.getByText('removeFromOrgButton')).toBeTruthy()
    fireEvent.click(screen.getByText('enableUserButton'))
    await waitFor(() => expect(setUserStatus).toHaveBeenCalledWith('beta', { disabled: false }))
  })
})
