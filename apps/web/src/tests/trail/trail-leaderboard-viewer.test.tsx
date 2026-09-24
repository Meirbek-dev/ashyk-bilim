/** @vitest-environment jsdom */
// UX-185: a viewer whose row is beyond the loaded page still sees their rank,
// and «Показать все» appears once the board holds more than the 10 shown rows.
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import Trail from '@/app/_shared/withmenu/trail/trail'
import { Leaderboard } from '@/components/Dashboard/Gamification/leaderboard'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/components/Objects/GamifiedUserAvatar', () => ({ default: () => null }))
vi.mock('@/components/Dashboard/Gamification/recent-activity-feed', () => ({ RecentActivityFeed: () => null }))
vi.mock('@components/Pages/Trail/UserCertificates', () => ({ default: () => null }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'me' } }) }))
vi.mock('@/stores/gamification', () => ({
  useGamificationStore: (select: (s: object) => unknown) => select({ dashboard: { user_rank: 11 } }),
}))
// The API pages at most 100 rows; a board of 11 learners fits only in a page larger than 10.
vi.mock('@/features/trail/hooks/useTrail', () => ({
  useTrailCurrent: () => ({ data: { runs: [] }, isLoading: false }),
  useTrailLeaderboard: (limit: number) => ({ data: { entries: rows(11).slice(0, limit) } }),
}))

const t = ruMessages.DashPage.UserAccountSettings.Gamification.leaderboard
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    user_id: `u${i}`,
    username: `u${i}`,
    display_name: `U${i}`,
    total_xp: 1000 - i,
    level: 1,
    rank: i + 1,
  }))

function renderBoard(props: React.ComponentProps<typeof Leaderboard>) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <Leaderboard {...props} />
    </NextIntlClientProvider>,
  )
}

describe('trail leaderboard viewer rank (UX-185)', () => {
  it('shows the rank of a viewer outside the loaded rows', () => {
    renderBoard({ entries: rows(10), currentUserId: 'me', userRank: 9 })
    expect(screen.getByText(t.yourPosition)).toBeInTheDocument()
    expect(screen.getByText('#9', { selector: '.font-semibold' })).toBeInTheDocument()
  })

  it('offers «Показать все» on /trail when the board has more rows than shown', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <Trail />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('button', { name: t.showAll })).toBeInTheDocument()
  })
})
