import type { LucideIcon } from 'lucide-react'

/**
 * User Profile and Level Types
 * Core gamification profile data
 */

// Backend-aligned profile interface
export interface UserGamificationProfile {
  id?: string // Optional; not always present in backend Profile
  user_id: string
  total_xp: number
  level: number

  // Streak data
  login_streak: number
  learning_streak: number
  longest_login_streak: number
  longest_learning_streak: number

  // Activity counters
  total_activities_completed: number
  total_courses_completed: number
  daily_xp_earned: number

  // Computed level progression
  xp_to_next_level?: number
  level_progress_percent?: number
  xp_in_current_level?: number

  // Timestamps
  last_xp_award_date?: string | null
  last_login_date?: string | null
  last_learning_date?: string | null
  created_at: string
  updated_at: string

  // User preferences (typed separately)
  preferences: Record<string, unknown>
}

// Level information with UI metadata
export interface LevelInfo {
  level: number
  title: string
  titleKey?: string
  color: string // Tailwind color class
  icon: LucideIcon // Icon component
  minXP: number
  maxXP?: number // undefined for max level
  unlocks?: string[]
}

// Streak information
export interface StreakInfo {
  login: {
    current: number
    longest: number
    lastDate: string | null
  }
  learning: {
    current: number
    longest: number
    lastDate: string | null
  }
}

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
  }
}
