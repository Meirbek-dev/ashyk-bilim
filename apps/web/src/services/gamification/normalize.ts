import type { Leaderboard, Profile } from '@/lib/api/generated/zod'
import type { PlatformLeaderboard, UserGamificationProfile } from '@/types/gamification'
import { fromUnix, unixToIso } from '@/lib/api/contract'
import { getContentUrl } from '@/services/media/media'

/** Wire `Profile` (epoch seconds) → app profile (ISO strings). */
export function normalizeProfile(profile: Profile): UserGamificationProfile {
  return {
    ...profile,
    created_at: fromUnix(profile.created_at_unix).toISOString(),
    updated_at: fromUnix(profile.updated_at_unix).toISOString(),
    last_xp_award_date: unixToIso(profile.last_xp_award_at_unix),
    last_login_date: unixToIso(profile.last_login_at_unix),
    last_learning_date: unixToIso(profile.last_learning_at_unix),
  }
}

/** Wire `Leaderboard` (`avatar_key`) → app leaderboard (`avatar_url`). */
export function normalizeLeaderboard(leaderboard: Leaderboard): PlatformLeaderboard {
  return {
    entries: leaderboard.entries.map(entry => ({
      user_id: entry.user_id,
      username: entry.username,
      display_name: entry.display_name,
      total_xp: entry.total_xp,
      level: entry.level,
      rank: entry.rank,
      avatar_url: entry.avatar_key ? getContentUrl(entry.avatar_key) : null,
    })),
    total_participants: leaderboard.total_participants,
    last_updated: new Date().toISOString(),
  }
}
