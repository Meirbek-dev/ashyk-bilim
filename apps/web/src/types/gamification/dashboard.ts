import type { StreakInfo, UserGamificationProfile } from './profile';
import type { PlatformLeaderboard } from './leaderboard';
import * as v from 'valibot';

/**
 * Dashboard and Aggregate Types
 * Combined views and summary data
 */

// Main dashboard data
export interface DashboardData {
  profile: UserGamificationProfile;
  recent_transactions: any[];
  leaderboard: PlatformLeaderboard;
  user_rank: number | null;
  streak_info: StreakInfo;
}

// Streak update response
export interface StreakUpdate {
  type: 'login' | 'learning';
  current_streak: number;
  longest_streak: number;
  streak_maintained: boolean;
  streak_broken: boolean;
  bonus_xp_awarded: number;
}

export const DashboardDataSchema = v.object({
  profile: v.any(), // Imported schema to avoid circular dependency
  recent_transactions: v.array(v.any()),
  leaderboard: v.any(),
  user_rank: v.nullable(v.number()),
  streak_info: v.object({
    login: v.object({
      current: v.number(),
      longest: v.number(),
      lastDate: v.nullable(v.string()),
    }),
    learning: v.object({
      current: v.number(),
      longest: v.number(),
      lastDate: v.nullable(v.string()),
    }),
  }),
});

export const StreakUpdateSchema = v.object({
  type: v.picklist(['login', 'learning']),
  current_streak: v.number(),
  longest_streak: v.number(),
  streak_maintained: v.boolean(),
  streak_broken: v.boolean(),
  bonus_xp_awarded: v.number(),
});
