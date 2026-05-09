import * as v from 'valibot';

/**
 * Leaderboard Types
 * Rankings and competitive features
 */

// Leaderboard entry for a single user
export interface LeaderboardEntry {
  user_id: number;
  username: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  total_xp: number;
  level: number;
  rank: number;
  // Additional computed fields
  is_current_user?: boolean;
  rank_change?: number; // Positive = moved up, negative = moved down, 0 = no change
  badge?: LeaderboardBadge | null; // Top 3 get special badges
}

// Leaderboard badge types
export type LeaderboardBadge = 'gold' | 'silver' | 'bronze';

export interface PlatformLeaderboard {
  entries: LeaderboardEntry[];
  total_participants: number;
  last_updated: string; // ISO timestamp
}

// Leaderboard filters
export interface LeaderboardFilters {
  timeframe?: 'daily' | 'weekly' | 'monthly' | 'all-time';
  scope?: 'platform' | 'friends' | 'global';
  limit?: number;
  offset?: number;
}

// User's rank information
export interface UserRank {
  rank: number;
  total_participants: number;
  percentile: number; // 0-100
  is_top_10: boolean;
  is_top_50: boolean;
  rank_badge: LeaderboardBadge | null;
}

export const LeaderboardEntrySchema = v.object({
  user_id: v.number(),
  username: v.nullable(v.string()),
  first_name: v.optional(v.nullable(v.string())),
  middle_name: v.optional(v.nullable(v.string())),
  last_name: v.optional(v.nullable(v.string())),
  avatar_url: v.optional(v.nullable(v.string())),
  total_xp: v.pipe(v.number(), v.minValue(0)),
  level: v.pipe(v.number(), v.minValue(1)),
  rank: v.pipe(v.number(), v.minValue(1)),
  is_current_user: v.optional(v.boolean()),
  rank_change: v.optional(v.number()),
  badge: v.optional(v.nullable(v.picklist(['gold', 'silver', 'bronze']))),
});

export const LeaderboardSchema = v.object({
  entries: v.array(LeaderboardEntrySchema),
  total_participants: v.pipe(v.number(), v.minValue(0)),
  last_updated: v.string(),
});

export const LeaderboardFiltersSchema = v.object({
  timeframe: v.optional(v.picklist(['daily', 'weekly', 'monthly', 'all-time'])),
  scope: v.optional(v.picklist(['platform', 'friends', 'global'])),
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100))),
  offset: v.optional(v.pipe(v.number(), v.minValue(0))),
});

export const UserRankSchema = v.object({
  rank: v.pipe(v.number(), v.minValue(1)),
  total_participants: v.pipe(v.number(), v.minValue(0)),
  percentile: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  is_top_10: v.boolean(),
  is_top_50: v.boolean(),
  rank_badge: v.nullable(v.picklist(['gold', 'silver', 'bronze'])),
});

// Helper functions
export function assignBadges(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.map((entry, index) => {
    let badge: LeaderboardBadge | null = null;
    if (entry.rank === 1) badge = 'gold';
    else if (entry.rank === 2) badge = 'silver';
    else if (entry.rank === 3) badge = 'bronze';

    return { ...entry, badge };
  });
}

export function markCurrentUser(entries: LeaderboardEntry[], currentUserId: number): LeaderboardEntry[] {
  return entries.map((entry) => ({
    ...entry,
    is_current_user: entry.user_id === currentUserId,
  }));
}

export function calculateRankChange(currentRank: number, previousRank: number | undefined): number {
  if (previousRank === undefined) return 0;
  // Positive = improved (moved up = lower rank number)
  return previousRank - currentRank;
}

export function calculatePercentile(rank: number, totalParticipants: number): number {
  if (totalParticipants === 0) return 0;
  return Math.round(((totalParticipants - rank + 1) / totalParticipants) * 100);
}

export function findUserInLeaderboard(leaderboard: PlatformLeaderboard, userId: number): LeaderboardEntry | null {
  return leaderboard.entries.find((entry) => entry.user_id === userId) ?? null;
}

export function getNearbyEntries(leaderboard: PlatformLeaderboard, userId: number, range = 2): LeaderboardEntry[] {
  const userIndex = leaderboard.entries.findIndex((entry) => entry.user_id === userId);
  if (userIndex === -1) return [];

  const start = Math.max(0, userIndex - range);
  const end = Math.min(leaderboard.entries.length, userIndex + range + 1);

  return leaderboard.entries.slice(start, end);
}

export function getTopEntries(leaderboard: PlatformLeaderboard, limit = 10): LeaderboardEntry[] {
  return leaderboard.entries.slice(0, limit);
}

export function enrichUserRank(
  leaderboard: PlatformLeaderboard,
  userId: number,
  previousRank?: number,
): UserRank | null {
  const userEntry = findUserInLeaderboard(leaderboard, userId);
  if (!userEntry) return null;

  const percentile = calculatePercentile(userEntry.rank, leaderboard.total_participants);

  return {
    rank: userEntry.rank,
    total_participants: leaderboard.total_participants,
    percentile,
    is_top_10: userEntry.rank <= 10,
    is_top_50: userEntry.rank <= 50,
    rank_badge: userEntry.badge ?? null,
  };
}
