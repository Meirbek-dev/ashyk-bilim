/** @vitest-environment jsdom */
// UX-064: «Уровень 5 · 500 ОП до следующего уровня» beside «100 ОП до
// следующего уровня». The milestone distance follows the server level curve
// and names its level; the level line keeps the profile's own number.
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { GamificationProfileSection } from '@/components/Dashboard/Gamification/GamificationProfileSection'
import { xpForLevel } from '@/lib/gamification/levels'
import type { UserGamificationProfile } from '@/types/gamification'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/components/Objects/GamifiedUserAvatar', () => ({ default: () => null }))

const profile = {
  user_id: 'u1',
  total_xp: 500,
  level: 3,
  xp_in_current_level: 200,
  xp_to_next_level: 100,
  level_progress_percent: 66.7,
  login_streak: 1,
  longest_login_streak: 1,
  learning_streak: 0,
  longest_learning_streak: 0,
  daily_xp_earned: 0,
  total_activities_completed: 0,
  total_courses_completed: 0,
  preferences: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_xp_award_date: null,
  last_login_date: null,
  last_learning_date: null,
} as unknown as UserGamificationProfile

describe('GamificationProfileSection milestone', () => {
  it('mirrors the server level curve', () => {
    expect([1, 2, 5, 10].map(xpForLevel)).toEqual([0, 100, 1000, 4500])
  })

  it('names the milestone level instead of «до следующего уровня»', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <GamificationProfileSection data={profile} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByTestId('milestone-xp')).toHaveTextContent('500 ОП до уровня 5')
    expect(screen.getAllByText(/до следующего уровня/)).toHaveLength(1)
  })
})
