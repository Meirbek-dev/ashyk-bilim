/**
 * Leaderboard Types
 * Rankings and competitive features
 */

// Leaderboard entry for a single user
export interface LeaderboardEntry {
  user_id: number
  username: string | null
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  avatar_url?: string | null
  total_xp: number
  level: number
  rank: number
  // Additional computed fields
  is_current_user?: boolean
  rank_change?: number // Positive = moved up, negative = moved down, 0 = no change
  badge?: LeaderboardBadge | null // Top 3 get special badges
}

// Leaderboard badge types
export type LeaderboardBadge = 'gold' | 'silver' | 'bronze'

export interface PlatformLeaderboard {
  entries: LeaderboardEntry[]
  total_participants: number
  last_updated: string // ISO timestamp
}

// Leaderboard filters
export interface LeaderboardFilters {
  timeframe?: 'daily' | 'weekly' | 'monthly' | 'all-time'
  scope?: 'platform' | 'friends' | 'global'
  limit?: number
  offset?: number
}

// User's rank information
export interface UserRank {
  rank: number
  total_participants: number
  percentile: number // 0-100
  is_top_10: boolean
  is_top_50: boolean
  rank_badge: LeaderboardBadge | null
}
