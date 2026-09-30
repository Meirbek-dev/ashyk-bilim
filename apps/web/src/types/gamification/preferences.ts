import * as v from 'valibot'

/**
 * User Preferences Types
 * Settings and customization options
 */

// Notification preferences
export interface NotificationPreferences {
  levelUp: boolean
  xpGain: boolean
  streakReminder: boolean
  weeklyReport: boolean
  achievements: boolean
  leaderboardPosition: boolean
}

// Privacy preferences
export interface PrivacyPreferences {
  showOnLeaderboard: boolean
  publicProfileStats: boolean
  shareProgress: boolean
  showAvatar: boolean
  showUsername: boolean
}

// Display preferences
export interface DisplayPreferences {
  animatedEffects: boolean
  compactMode: boolean
  showLevelIndicator: boolean
  autoHideToasts: boolean
  soundEffects: boolean
  showXPNumbers: boolean
  theme: 'auto' | 'light' | 'dark'
}

// Gamification preferences (complete)
export interface GamificationPreferences {
  notifications: NotificationPreferences
  privacy: PrivacyPreferences
  display: DisplayPreferences
}

// Partial preferences for updates
export interface PartialGamificationPreferences {
  notifications?: Partial<NotificationPreferences>
  privacy?: Partial<PrivacyPreferences>
  display?: Partial<DisplayPreferences>
}

export const NotificationPreferencesSchema = v.object({
  levelUp: v.boolean(),
  xpGain: v.boolean(),
  streakReminder: v.boolean(),
  weeklyReport: v.boolean(),
  achievements: v.boolean(),
  leaderboardPosition: v.boolean(),
})

export const PrivacyPreferencesSchema = v.object({
  showOnLeaderboard: v.boolean(),
  publicProfileStats: v.boolean(),
  shareProgress: v.boolean(),
  showAvatar: v.boolean(),
  showUsername: v.boolean(),
})

export const DisplayPreferencesSchema = v.object({
  animatedEffects: v.boolean(),
  compactMode: v.boolean(),
  showLevelIndicator: v.boolean(),
  autoHideToasts: v.boolean(),
  soundEffects: v.boolean(),
  showXPNumbers: v.boolean(),
  theme: v.picklist(['auto', 'light', 'dark']),
})
