/** @vitest-environment jsdom */
// Gauntlet: the settings page read the per-tab persisted store (nothing in
// `/dash` refreshes it), so toggles showed stale values after a reload. The
// first render now follows the server-fetched `initialProfile`.
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import UserGamificationSettings, {
  readGamificationPreferences,
} from '@/components/Dashboard/Pages/UserAccount/UserGamificationSettings/UserGamificationSettings'
import { useGamificationStore } from '@/stores/gamification'
import type { UserGamificationProfile } from '@/types/gamification'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/app/actions/gamification', () => ({
  getDashboardDataAction: vi.fn(),
  getLeaderboardAction: vi.fn(),
  updatePreferencesAction: vi.fn(),
  updateStreakAction: vi.fn(),
}))
vi.mock('@/components/Dashboard/Gamification', () => ({ GamificationProfileSection: () => null }))

const profileWith = (xpGain: boolean): UserGamificationProfile =>
  ({
    user_id: 'u1',
    total_xp: 40,
    level: 1,
    xp_in_current_level: 40,
    xp_to_next_level: 60,
    level_progress_percent: 40,
    login_streak: 1,
    longest_login_streak: 1,
    learning_streak: 0,
    longest_learning_streak: 0,
    daily_xp_earned: 0,
    total_activities_completed: 0,
    total_courses_completed: 0,
    preferences: { notifications: { xpGain } },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_xp_award_date: null,
    last_login_date: null,
    last_learning_date: null,
  }) as UserGamificationProfile

describe('UserGamificationSettings initial profile', () => {
  it('reads the three form keys from the free-form wire object', () => {
    expect(readGamificationPreferences({ notifications: { xpGain: false } }).xpGainNotifications).toBe(false)
    expect(readGamificationPreferences({}).xpGainNotifications).toBe(true)
  })

  it('renders the server profile, not the stale persisted store', () => {
    // Stale per-tab cache says ON; the server says OFF.
    useGamificationStore.setState({ profile: profileWith(true) })
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <UserGamificationSettings initialProfile={profileWith(false)} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('switch', { name: 'Уведомления о получении опыта' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})
