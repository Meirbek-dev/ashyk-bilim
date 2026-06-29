import type { StreakInfo, UserGamificationProfile } from './profile'
import type { PlatformLeaderboard } from './leaderboard'

/**
 * Dashboard and Aggregate Types
 * Combined views and summary data
 */

// Main dashboard data
export interface DashboardData {
  profile: UserGamificationProfile
  recent_transactions: unknown[]
  leaderboard: PlatformLeaderboard
  user_rank: number | null
  streak_info: StreakInfo
}

// Streak update response
export interface StreakUpdate {
  type: 'login' | 'learning'
  current_streak: number
  longest_streak: number
  streak_maintained: boolean
  streak_broken: boolean
  bonus_xp_awarded: number
}
