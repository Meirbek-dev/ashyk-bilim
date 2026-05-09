import type { LucideIcon } from 'lucide-react';
import * as v from 'valibot';

/**
 * User Profile and Level Types
 * Core gamification profile data
 */

// Backend-aligned profile interface
export interface UserGamificationProfile {
  id?: number; // Optional; not always present in backend ProfileRead
  user_id: number;
  total_xp: number;
  level: number;

  // Streak data
  login_streak: number;
  learning_streak: number;
  longest_login_streak: number;
  longest_learning_streak: number;

  // Activity counters
  total_activities_completed: number;
  total_courses_completed: number;
  daily_xp_earned: number;

  // Computed level progression
  xp_to_next_level?: number;
  level_progress_percent?: number;
  xp_in_current_level?: number;

  // Timestamps
  last_xp_award_date?: string | null;
  last_login_date?: string | null;
  last_learning_date?: string | null;
  created_at: string;
  updated_at: string;

  // User preferences (typed separately)
  preferences: Record<string, unknown>;
}

// Level information with UI metadata
export interface LevelInfo {
  level: number;
  title: string;
  titleKey?: string;
  color: string; // Tailwind color class
  icon: LucideIcon; // Icon component
  minXP: number;
  maxXP?: number; // undefined for max level
  unlocks?: string[];
}

// Streak information
export interface StreakInfo {
  login: {
    current: number;
    longest: number;
    lastDate: string | null;
  };
  learning: {
    current: number;
    longest: number;
    lastDate: string | null;
  };
}

export const UserGamificationProfileSchema = v.object({
  id: v.optional(v.number()),
  user_id: v.number(),
  total_xp: v.pipe(v.number(), v.minValue(0)),
  level: v.pipe(v.number(), v.minValue(1), v.maxValue(100)),
  login_streak: v.pipe(v.number(), v.minValue(0)),
  learning_streak: v.pipe(v.number(), v.minValue(0)),
  longest_login_streak: v.pipe(v.number(), v.minValue(0)),
  longest_learning_streak: v.pipe(v.number(), v.minValue(0)),
  total_activities_completed: v.pipe(v.number(), v.minValue(0)),
  total_courses_completed: v.pipe(v.number(), v.minValue(0)),
  daily_xp_earned: v.pipe(v.number(), v.minValue(0)),
  xp_in_current_level: v.optional(v.pipe(v.number(), v.minValue(0))),
  xp_to_next_level: v.optional(v.pipe(v.number(), v.minValue(0))),
  level_progress_percent: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
  last_xp_award_date: v.optional(v.nullable(v.string())),
  last_login_date: v.optional(v.nullable(v.string())),
  last_learning_date: v.optional(v.nullable(v.string())),
  preferences: v.record(v.string(), v.unknown()),
  created_at: v.string(),
  updated_at: v.string(),
});

export const LevelInfoSchema = v.object({
  level: v.number(),
  title: v.string(),
  titleKey: v.optional(v.string()),
  color: v.string(),
  icon: v.any(),
  minXP: v.number(),
  maxXP: v.optional(v.number()),
  unlocks: v.optional(v.array(v.string())),
});

export const StreakInfoSchema = v.object({
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
});

// Helper functions
export function extractStreakInfo(profile: UserGamificationProfile): StreakInfo {
  return {
    login: {
      current: profile.login_streak,
      longest: profile.longest_login_streak,
      lastDate: profile.last_login_date ?? null,
    },
    learning: {
      current: profile.learning_streak,
      longest: profile.longest_learning_streak,
      lastDate: profile.last_learning_date ?? null,
    },
  };
}

export function calculateLevelProgress(profile: UserGamificationProfile): {
  currentLevelXP: number;
  nextLevelXP: number;
  progressPercent: number;
  xpToNext: number;
} {
  const currentLevelXP = profile.xp_in_current_level ?? 0;
  const xpToNext = profile.xp_to_next_level ?? 100;
  const nextLevelXP = currentLevelXP + xpToNext;
  const progressPercent =
    profile.level_progress_percent ?? (nextLevelXP > 0 ? (currentLevelXP / nextLevelXP) * 100 : 0);

  return {
    currentLevelXP,
    nextLevelXP,
    progressPercent: Math.min(progressPercent, 100),
    xpToNext,
  };
}

// ===================================
// TYPE GUARDS
// ===================================

/**
 * Check if a profile has valid XP data
 */
export function hasValidXP(profile: unknown): profile is UserGamificationProfile {
  return (
    typeof profile === 'object' &&
    profile !== null &&
    'total_xp' in profile &&
    typeof (profile as UserGamificationProfile).total_xp === 'number' &&
    (profile as UserGamificationProfile).total_xp >= 0
  );
}

/**
 * Check if profile has active streak
 */
export function hasActiveStreak(profile: UserGamificationProfile): boolean {
  return profile.login_streak > 0 || profile.learning_streak > 0;
}

/**
 * Check if profile is at max level
 */
export function isMaxLevel(profile: UserGamificationProfile): boolean {
  return profile.level >= 100;
}

/**
 * Check if profile can earn more XP today
 */
export function canEarnMoreXPToday(profile: UserGamificationProfile, dailyLimit = 500): boolean {
  return profile.daily_xp_earned < dailyLimit;
}

/**
 * Type guard for LevelInfo
 */
export function isLevelInfo(value: unknown): value is LevelInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'level' in value &&
    'title' in value &&
    'color' in value &&
    'icon' in value &&
    'minXP' in value
  );
}
