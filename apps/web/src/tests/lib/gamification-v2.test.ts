import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { apiJson } from '@/lib/api-client'
import { getServerGamificationDashboard, getServerLeaderboard } from '@/services/gamification/server'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/services/config/config', () => ({ getServerAPIUrl: () => '/api/v2/' }))
vi.mock('@/services/media/media', () => ({ getContentUrl: (key: string) => `/content/${key}` }))

const userId = '11111111-1111-4111-8111-111111111111'
const transactionId = '22222222-2222-4222-8222-222222222222'
const dashboard = {
  profile: {
    user_id: userId,
    total_xp: 110,
    level: 2,
    daily_xp_earned: 10,
    login_streak: 1,
    learning_streak: 0,
    longest_login_streak: 3,
    longest_learning_streak: 2,
    total_activities_completed: 1,
    total_courses_completed: 0,
    xp_to_next_level: 290,
    xp_in_current_level: 10,
    level_progress_percent: 3.33,
    created_at_unix: 1700000000,
    updated_at_unix: 1700000060,
    last_login_at_unix: 1700000060,
    last_learning_at_unix: null,
    last_xp_award_at_unix: null,
    preferences: {},
  },
  leaderboard: {
    entries: [
      {
        user_id: userId,
        username: 'learner',
        display_name: 'Full Name',
        avatar_key: 'avatars/photo.png',
        total_xp: 110,
        level: 2,
        rank: 1,
      },
    ],
    total_participants: 1,
  },
  recent_transactions: [
    {
      id: transactionId,
      user_id: userId,
      amount: 10,
      source: 'login_bonus',
      source_id: null,
      created_at_unix: 1700000060,
      previous_level: 2,
      triggered_level_up: false,
    },
  ],
  user_rank: 1,
}

describe('gamification v2 boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves UUIDs and converts epoch seconds while validating the server response', async () => {
    vi.mocked(apiJson).mockImplementation(async (_path, _init, parse) => (parse ? parse(dashboard) : dashboard))
    const result = await getServerGamificationDashboard()
    expect(apiJson).toHaveBeenCalledWith('gamification', expect.anything(), expect.any(Function))
    expect(result?.profile).toMatchObject({
      user_id: userId,
      created_at: '2023-11-14T22:13:20.000Z',
      last_login_date: '2023-11-14T22:14:20.000Z',
      last_learning_date: null,
    })
    expect(result?.recent_transactions[0]).toMatchObject({ id: transactionId, user_id: userId })
    expect(result?.leaderboard.entries[0]).toMatchObject({
      user_id: userId,
      display_name: 'Full Name',
      avatar_url: '/content/avatars/photo.png',
    })
    vi.mocked(apiJson).mockImplementation(async (_path, _init, parse) => (parse ? parse({ profile: {} }) : {}))
    await expect(getServerGamificationDashboard()).rejects.toThrow()
  })

  it('propagates a failed leaderboard request instead of presenting an empty leaderboard', async () => {
    const failure = new Error('Connection failed')
    vi.mocked(apiJson).mockRejectedValue(failure)
    await expect(getServerLeaderboard()).rejects.toBe(failure)
  })
})
