import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { dashboardQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { Dashboard } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { StreakBadge } from '../index'

function render(learning_streak: number, last_learning_at_unix: number) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const dashboard: Dashboard = {
    profile: {
      created_at_unix: 0,
      daily_xp_earned: 0,
      learning_streak,
      last_learning_at_unix,
      last_login_at_unix: null,
      last_xp_award_at_unix: null,
      level: 1,
      level_progress_percent: 0,
      login_streak: 1,
      longest_learning_streak: learning_streak,
      longest_login_streak: 1,
      preferences: {},
      settings: {
        display: { animated_effects: null, compact_mode: null },
        notifications: { xp_gain: null },
        privacy: { show_on_leaderboard: null },
      },
      total_activities_completed: 0,
      total_courses_completed: 0,
      total_xp: 0,
      updated_at_unix: 0,
      user_id: '0199a8d5-da4c-753b-a6c4-a08d294bbab5',
      xp_in_current_level: 0,
      xp_to_next_level: 100,
    },
    recent_transactions: [],
    leaderboard: { entries: [], total_participants: 0, next_cursor: null },
    daily_xp: { earned_today: 0, limit: 500 },
    user_rank: null,
  }
  client.setQueryData(dashboardQueryKey(), dashboard)
  return renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <StreakBadge />
      </Suspense>
    </QueryClientProvider>,
  )
}

test('B-ACH-08 the /home pills link the level and a live learning streak to /achievements', async () => {
  const now = Math.floor(Date.now() / 1000)
  const live = await render(3, now - 60)
  const text = m.achievements_streak_badge({ days: m.achievements_days({ count: 3 }) })
  await expect.element(live.getByRole('link', { name: text })).toHaveAttribute('href', '/achievements')
  const level = m.achievements_summary({ level: 1, xp: '0' })
  await expect.element(live.getByRole('link', { name: level })).toHaveAttribute('href', '/achievements')

  const broken = await render(3, now - 3 * 86_400)
  await expect.element(broken.getByRole('link', { name: level })).toBeInTheDocument()
  await expect.element(broken.getByRole('link', { name: text })).not.toBeInTheDocument()
})

test('B-ACH-15 on a narrow home the pills read «0 XP» and «3 дня»; the full wording stays their name', async () => {
  const screen = await render(3, Math.floor(Date.now() / 1000) - 60)
  await expect.element(screen.getByText(m.achievements_xp({ xp: '0' }), { exact: true })).toBeVisible()
  await expect.element(screen.getByText(m.achievements_days({ count: 3 }), { exact: true })).toBeVisible()
  // The full wording is there for screen readers only (sr-only), not drawn.
  const full = screen.getByText(m.achievements_summary({ level: 1, xp: '0' })).element()
  expect(full.getBoundingClientRect().width).toBeLessThanOrEqual(1)
})
