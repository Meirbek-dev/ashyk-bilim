import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { apiJson } from '@/lib/api-client'
import { updatePreferencesOnServer } from '@/services/gamification/server'
import { trailLeaderboardQueryOptions } from '@/features/courses/queries/course.query'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiResult: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/services/config/config', () => ({ getServerAPIUrl: () => '/api/v2/' }))
vi.mock('@/services/media/media', () => ({ getContentUrl: (key: string) => `/content/${key}` }))
vi.mock('@services/courses/editor', () => ({ getCourseEditorBundle: vi.fn() }))
vi.mock('@services/courses/courses', () => ({ getCourseMetadata: vi.fn() }))

const userId = '11111111-1111-4111-8111-111111111111'
const profile = {
  user_id: userId,
  total_xp: 40,
  level: 1,
  daily_xp_earned: 0,
  login_streak: 1,
  learning_streak: 0,
  longest_login_streak: 1,
  longest_learning_streak: 0,
  total_activities_completed: 0,
  total_courses_completed: 0,
  xp_to_next_level: 60,
  xp_in_current_level: 40,
  level_progress_percent: 40,
  created_at_unix: 1700000000,
  updated_at_unix: 1700000060,
  last_login_at_unix: null,
  last_learning_at_unix: null,
  last_xp_award_at_unix: null,
  preferences: { privacy: { showOnLeaderboard: false } },
}

beforeEach(() => vi.resetAllMocks())

describe('gamification preferences (v2)', () => {
  it('PATCHes gamification/preferences and returns the merged profile the server answers with', async () => {
    vi.mocked(apiJson).mockImplementation(async (_path, _init, parse) => (parse ? parse(profile) : profile))
    const result = await updatePreferencesOnServer({ privacy: { showOnLeaderboard: false } })
    expect(apiJson).toHaveBeenCalledWith(
      'gamification/preferences',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ privacy: { showOnLeaderboard: false } }) }),
      expect.any(Function),
    )
    expect(result).toMatchObject({ user_id: userId, preferences: { privacy: { showOnLeaderboard: false } } })
    expect(result.created_at).toBe('2023-11-14T22:13:20.000Z')
  })

  it('maps the wire leaderboard avatar_key to avatar_url for the trail page', async () => {
    const wire = {
      entries: [{ rank: 1, user_id: userId, total_xp: 40, level: 1, username: 'learner', display_name: 'L', avatar_key: 'avatar/x' }],
      total_participants: 1,
    }
    vi.mocked(apiJson).mockImplementation(async (_path, _init, parse) => (parse ? parse(wire) : wire))
    const options = trailLeaderboardQueryOptions(10)
    const data = await (options.queryFn as unknown as () => Promise<{ entries: { avatar_url: string | null }[] }>)()
    expect(apiJson).toHaveBeenCalledWith('gamification/leaderboard?limit=10', {}, expect.any(Function))
    expect(data.entries[0]?.avatar_url).toBe('/content/avatar/x')
  })
})
