import { describe, expect, it, vi } from 'vite-plus/test'
import type { ReactElement } from 'react'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  dashboard: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ requireSession: mocks.requireSession }))
vi.mock('@/services/gamification/server', () => ({ getServerGamificationDashboard: mocks.dashboard }))
vi.mock('@components/Dashboard/Pages/UserAccount/UserEditGeneral/UserEditGeneral', () => ({ default: () => null }))
vi.mock('@components/Dashboard/Pages/UserAccount/UserGamificationSettings/UserGamificationSettings', () => ({
  default: () => null,
}))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))

import UserAccountGeneralPage from '@/app/[locale]/(platform)/dash/user-account/settings/general/page'
import UserAccountGamificationPage from '@/app/[locale]/(platform)/dash/user-account/settings/gamification/page'

type Page = ReactElement<{ children: ReactElement<Record<string, never>> }>

async function renderContent(page: Page) {
  const content = page.props.children
  return (content.type as (props: unknown) => Promise<unknown>)(content.props)
}

// UX-126: the dash-layout `requireSession` runs once per layout, so a sibling
// settings-tab nav after the session was revoked elsewhere rendered the
// client-cached profile. Every tab must re-validate on the server.
describe('user settings tabs re-validate the session', () => {
  it('general redirects through requireSession', async () => {
    const redirect = new Error('NEXT_REDIRECT')
    mocks.requireSession.mockRejectedValueOnce(redirect)
    await expect(renderContent(UserAccountGeneralPage() as Page)).rejects.toBe(redirect)
  })

  it('gamification redirects before fetching the dashboard', async () => {
    const redirect = new Error('NEXT_REDIRECT')
    mocks.requireSession.mockRejectedValueOnce(redirect)
    await expect(renderContent(UserAccountGamificationPage() as Page)).rejects.toBe(redirect)
    expect(mocks.dashboard).not.toHaveBeenCalled()
  })
})
