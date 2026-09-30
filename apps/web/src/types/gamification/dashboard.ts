import type { StreakInfo, UserGamificationProfile } from './profile'
import type { PlatformLeaderboard } from './leaderboard'
import type { XPTransaction } from './transactions'

/**
 * Dashboard and Aggregate Types
 * Combined views and summary data
 */

// Main dashboard data
export interface DashboardData {
  profile: UserGamificationProfile
  recent_transactions: XPTransaction[]
  leaderboard: PlatformLeaderboard
  user_rank: number | null
  streak_info: StreakInfo
}

// Streak update response
export type { StreakUpdate } from '@/lib/api/generated/zod'
