import { describe, expect, it, vi } from 'vite-plus/test'
import type { ReactElement } from 'react'

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  dashboard: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ requireSession: mocks.requireSession }))
vi.mock('@/services/gamification/server', () => ({
  getServerGamificationDashboard: mocks.dashboard,
  getServerLeaderboard: vi.fn(),
}))
vi.mock('@/components/Contexts/GamificationContext', () => ({ GamificationProvider: () => null }))
vi.mock('@/app/_shared/withmenu/trail/trail', () => ({ default: () => null }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))

import PlatformTrailPage from '@/app/[locale]/(platform)/(withmenu)/trail/page'

// UX-054: anonymous /trail rendered first (firing me/certificates + leaderboard → 401s)
// and only then redirected client-side; the server guard must run before any fetch.
describe('trail page server guard', () => {
  it('redirects through requireSession before fetching anything', async () => {
    const redirect = new Error('NEXT_REDIRECT')
    mocks.requireSession.mockRejectedValueOnce(redirect)
    const params = Promise.resolve({ locale: 'ru' })
    const page = (await PlatformTrailPage({ params })) as ReactElement<{
      children: ReactElement<{ params: typeof params }>
    }>
    const content = page.props.children
    await expect((content.type as (props: unknown) => Promise<unknown>)(content.props)).rejects.toBe(redirect)
    expect(mocks.dashboard).not.toHaveBeenCalled()
  })
})
