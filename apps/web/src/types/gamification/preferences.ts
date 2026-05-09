import * as v from 'valibot';

/**
 * User Preferences Types
 * Settings and customization options
 */

// Notification preferences
export interface NotificationPreferences {
  levelUp: boolean;
  xpGain: boolean;
  streakReminder: boolean;
  weeklyReport: boolean;
  achievements: boolean;
  leaderboardPosition: boolean;
}

// Privacy preferences
export interface PrivacyPreferences {
  showOnLeaderboard: boolean;
  publicProfileStats: boolean;
  shareProgress: boolean;
  showAvatar: boolean;
  showUsername: boolean;
}

// Display preferences
export interface DisplayPreferences {
  animatedEffects: boolean;
  compactMode: boolean;
  showLevelIndicator: boolean;
  autoHideToasts: boolean;
  soundEffects: boolean;
  showXPNumbers: boolean;
  theme: 'auto' | 'light' | 'dark';
}

// Gamification preferences (complete)
export interface GamificationPreferences {
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
  display: DisplayPreferences;
}

// Partial preferences for updates
export interface PartialGamificationPreferences {
  notifications?: Partial<NotificationPreferences>;
  privacy?: Partial<PrivacyPreferences>;
  display?: Partial<DisplayPreferences>;
}

// Default preferences factory - optimized for less intrusive experience
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  levelUp: true, // Important milestone
  xpGain: false, // Too noisy by default
  streakReminder: false, // Can cause anxiety
  weeklyReport: true, // Good summary
  achievements: true, // Meaningful events
  leaderboardPosition: false, // Opt-in only
};

export const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
  showOnLeaderboard: true,
  publicProfileStats: true,
  shareProgress: false,
  showAvatar: true,
  showUsername: true,
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  animatedEffects: true, // Will respect prefers-reduced-motion
  compactMode: true, // Less intrusive by default
  showLevelIndicator: true,
  autoHideToasts: true, // Auto-dismiss for cleaner UX
  soundEffects: false, // Opt-in only
  showXPNumbers: true,
  theme: 'auto',
};

export const DEFAULT_GAMIFICATION_PREFERENCES: GamificationPreferences = {
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  privacy: DEFAULT_PRIVACY_PREFERENCES,
  display: DEFAULT_DISPLAY_PREFERENCES,
};

export const NotificationPreferencesSchema = v.object({
  levelUp: v.boolean(),
  xpGain: v.boolean(),
  streakReminder: v.boolean(),
  weeklyReport: v.boolean(),
  achievements: v.boolean(),
  leaderboardPosition: v.boolean(),
});

export const PrivacyPreferencesSchema = v.object({
  showOnLeaderboard: v.boolean(),
  publicProfileStats: v.boolean(),
  shareProgress: v.boolean(),
  showAvatar: v.boolean(),
  showUsername: v.boolean(),
});

export const DisplayPreferencesSchema = v.object({
  animatedEffects: v.boolean(),
  compactMode: v.boolean(),
  showLevelIndicator: v.boolean(),
  autoHideToasts: v.boolean(),
  soundEffects: v.boolean(),
  showXPNumbers: v.boolean(),
  theme: v.picklist(['auto', 'light', 'dark']),
});

export const GamificationPreferencesSchema = v.object({
  notifications: NotificationPreferencesSchema,
  privacy: PrivacyPreferencesSchema,
  display: DisplayPreferencesSchema,
});

export const PartialGamificationPreferencesSchema = v.object({
  notifications: v.optional(v.partial(NotificationPreferencesSchema)),
  privacy: v.optional(v.partial(PrivacyPreferencesSchema)),
  display: v.optional(v.partial(DisplayPreferencesSchema)),
});

// Helper functions
export function createDefaultPreferences(): GamificationPreferences {
  return structuredClone(DEFAULT_GAMIFICATION_PREFERENCES);
}

export function mergePreferences(
  current: GamificationPreferences,
  updates: PartialGamificationPreferences,
): GamificationPreferences {
  return {
    notifications: {
      ...current.notifications,
      ...updates.notifications,
    },
    privacy: {
      ...current.privacy,
      ...updates.privacy,
    },
    display: {
      ...current.display,
      ...updates.display,
    },
  };
}

export function validatePreferences(prefs: unknown): GamificationPreferences {
  const result = v.safeParse(GamificationPreferencesSchema, prefs);
  if (result.success) {
    return result.output;
  }
  // Return defaults if validation fails
  console.warn('Invalid preferences, using defaults:', result.issues);
  return createDefaultPreferences();
}

export function serializePreferences(prefs: GamificationPreferences): string {
  return JSON.stringify(prefs);
}

export function deserializePreferences(json: string): GamificationPreferences {
  try {
    const parsed = JSON.parse(json);
    return validatePreferences(parsed);
  } catch {
    return createDefaultPreferences();
  }
}

// Type guards
export function hasNotificationEnabled(prefs: GamificationPreferences, type: keyof NotificationPreferences): boolean {
  return prefs.notifications[type];
}

export function isProfilePublic(prefs: GamificationPreferences): boolean {
  return prefs.privacy.publicProfileStats;
}

export function shouldShowOnLeaderboard(prefs: GamificationPreferences): boolean {
  return prefs.privacy.showOnLeaderboard;
}

export function hasAnimationsEnabled(prefs: GamificationPreferences): boolean {
  return prefs.display.animatedEffects;
}

export function hasSoundEnabled(prefs: GamificationPreferences): boolean {
  return prefs.display.soundEffects;
}
