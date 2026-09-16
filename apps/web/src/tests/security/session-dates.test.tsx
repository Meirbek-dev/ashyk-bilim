/** @vitest-environment jsdom */
// Gauntlet: "Активные сессии" dates rendered en-US ("9/12/2026, 12:36:37 AM")
// under the ru locale.
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserSecuritySettings from '@/components/Dashboard/Pages/UserAccount/UserSecuritySettings/UserSecuritySettings'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
vi.mock('@services/auth/auth', () => ({
  getSessionInfo: async () => ({ session_id: 's1', user_id: 'u1', roles: ['user'], permissions: [], mfa_enabled: false }),
  listSessions: async () => [
    { handle: 'h1', user_agent: 'Chrome', ip: '127.0.0.1', current: true, last_seen_unix: 1789173397 },
  ],
  removeTotp: vi.fn(),
  revokeSession: vi.fn(),
  startTotpEnrollment: vi.fn(),
  verifyTotpEnrollment: vi.fn(),
}))

describe('UserSecuritySettings session dates', () => {
  it('formats last-seen for the app locale', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <UserSecuritySettings />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/12 сент\. 2026 г\./)).toBeInTheDocument()
    expect(screen.queryByText(/9\/12\/2026/)).toBeNull()
  })
})
