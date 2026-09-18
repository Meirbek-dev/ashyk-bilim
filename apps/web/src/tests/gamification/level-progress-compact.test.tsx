/** @vitest-environment jsdom */
// UX-109: the compact level line read «180 … 120 ОП» (xp in level / xp to
// next) as «180 of 120». It now says «180 ОП · 120 до уровня 4», and the bar
// spans current + remaining (`xp_to_next_level` is the XP still missing).
import { describe, expect, it } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { LevelProgress } from '@/lib/gamification/components/level-indicators'
import type { UserGamificationProfile } from '@/types/gamification'
import ruMessages from '@/messages/ru-RU.json'

const profile = {
  user_id: 'u1',
  total_xp: 480,
  level: 3,
  xp_in_current_level: 180,
  xp_to_next_level: 120,
  level_progress_percent: 60,
  preferences: {},
} as unknown as UserGamificationProfile

describe('LevelProgress (compact)', () => {
  it('names the remaining XP and the target level', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <LevelProgress profile={profile} animated={false} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('180 ОП · 120 до уровня 4')).toBeInTheDocument()
  })
})
