/**
 * Gamification Types - Modular Structure
 *
 * Organized by domain for better maintainability:
 * - errors: Type-safe error handling with discriminated unions
 * - profile: User profiles and level information
 * - transactions: XP awards and transaction history
 * - leaderboard: Rankings and competitive features
 * - preferences: User settings and customization
 * - customization: Avatar frames and accessories
 * - dashboard: Aggregate views and summaries
 */

// Re-export all types from domain modules
export * from './errors';
export * from './profile';
export * from './transactions';
export * from './leaderboard';
export * from './preferences';
export * from './customization';
export * from './dashboard';

// Re-export type guards for convenience
export {
  isNetworkError,
  isAuthError,
  isDailyLimitExceededError,
  isValidationError,
  isServerError,
  isUnknownError,
} from './errors';

// Common type aliases for convenience
export type { GamificationError } from './errors';
export type { UserGamificationProfile, LevelInfo, StreakInfo } from './profile';
export type { XPSource, XPTransaction, XPAwardRequest, XPAwardResponse } from './transactions';
export type { LeaderboardEntry, PlatformLeaderboard, UserRank, LeaderboardFilters } from './leaderboard';
export type {
  GamificationPreferences,
  NotificationPreferences,
  PrivacyPreferences,
  DisplayPreferences,
} from './preferences';
export type { AvatarFrame, AvatarAccessory, AvatarCustomization } from './customization';
export type { DashboardData, StreakUpdate } from './dashboard';

// Streak type (used across modules)
export type StreakType = 'login' | 'learning';
