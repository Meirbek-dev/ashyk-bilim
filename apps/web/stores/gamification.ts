'use client';

import type {
  DashboardData,
  GamificationError,
  PlatformLeaderboard,
  UserGamificationProfile,
  XPAwardRequest,
  XPAwardResponse,
} from '@/types/gamification';
import {
  awardXPAction,
  getDashboardDataAction,
  getLeaderboardAction,
  updatePreferencesAction,
  updateStreakAction,
} from '@/app/actions/gamification';
import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface XPToastPayload {
  amount: number;
  source?: string;
}

interface GamificationState {
  profile: UserGamificationProfile | null;
  dashboard: DashboardData | null;
  leaderboard: PlatformLeaderboard | null;
  isLoading: boolean;
  error: GamificationError | null;
  levelUpQueue: { newLevel: number }[];
  pendingXPToasts: XPToastPayload[];
  // Circuit breaker
  fetchAttempts: number;
  lastFetchTime: number;
}

interface GamificationActions {
  /** Hydrate from server-provided initial data (called by GamificationProvider). */
  _hydrate: (data: {
    profile?: UserGamificationProfile | null;
    dashboard?: DashboardData | null;
    leaderboard?: PlatformLeaderboard | null;
  }) => void;
  /** Fetch data only when not already loaded and circuit breaker allows it. */
  fetchIfNeeded: () => Promise<void>;
  refetch: () => Promise<void>;
  awardXP: (payload: XPAwardRequest, options?: { silent?: boolean }) => Promise<XPAwardResponse>;
  updateStreak: (type: 'login' | 'learning') => Promise<void>;
  updatePreferences: (preferences: Record<string, any>) => Promise<void>;
  /** Push an XP toast to the queue for the UI bridge to drain. */
  showXPToast: (amount: number, source?: string) => void;
  showLevelUpCelebration: (newLevel: number) => void;
  dismissLevelUpCelebration: () => void;
  /** Drain and return all pending XP toasts (called by GamificationProvider). */
  consumeXPToasts: () => XPToastPayload[];
}

const MAX_FETCH_ATTEMPTS = 3;
const FETCH_COOLDOWN_MS = 60_000;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGamificationStore = create<GamificationState & GamificationActions>((set, get) => ({
  // State
  profile: null,
  dashboard: null,
  leaderboard: null,
  isLoading: false,
  error: null,
  levelUpQueue: [],
  pendingXPToasts: [],
  fetchAttempts: 0,
  lastFetchTime: 0,

  // Actions
  _hydrate: (data) =>
    set((s) => ({
      profile: data.profile !== undefined ? data.profile : s.profile,
      dashboard: data.dashboard !== undefined ? data.dashboard : s.dashboard,
      leaderboard: data.leaderboard !== undefined ? data.leaderboard : s.leaderboard,
    })),

  fetchIfNeeded: async () => {
    const { profile, isLoading, fetchAttempts, lastFetchTime } = get();
    if (profile || isLoading) return;

    const now = Date.now();
    if (fetchAttempts >= MAX_FETCH_ATTEMPTS && now - lastFetchTime < FETCH_COOLDOWN_MS) {
      console.warn('Gamification fetch circuit breaker triggered - too many failed attempts');
      return;
    }
    if (fetchAttempts >= MAX_FETCH_ATTEMPTS) {
      set({ fetchAttempts: 0 });
    }

    set({ isLoading: true, lastFetchTime: now });
    try {
      const [dashboardData, leaderboardData] = await Promise.all([getDashboardDataAction(), getLeaderboardAction()]);
      if (dashboardData) {
        set({ profile: dashboardData.profile, dashboard: dashboardData, fetchAttempts: 0 });
      } else {
        set((s) => ({ fetchAttempts: s.fetchAttempts + 1 }));
      }
      if (leaderboardData) set({ leaderboard: leaderboardData });
    } catch (error) {
      console.error('Failed to fetch initial gamification data:', error);
      set((s) => ({ fetchAttempts: s.fetchAttempts + 1 }));
    } finally {
      set({ isLoading: false });
    }
  },

  refetch: async () => {
    set({ isLoading: true });
    try {
      const [dashboardData, leaderboardData] = await Promise.all([getDashboardDataAction(), getLeaderboardAction()]);
      if (dashboardData) set({ profile: dashboardData.profile, dashboard: dashboardData });
      if (leaderboardData) set({ leaderboard: leaderboardData });
    } catch (error) {
      console.error('Failed to refetch gamification data:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  awardXP: async (payload, options = {}) => {
    set({ error: null });
    try {
      const result = await awardXPAction(payload);
      if (result.profile) {
        set((s) => ({
          profile: result.profile,
          dashboard: s.dashboard ? { ...s.dashboard, profile: result.profile } : s.dashboard,
        }));
        if (!options.silent && result.transaction.amount > 0) {
          set((s) => ({
            pendingXPToasts: [...s.pendingXPToasts, { amount: result.transaction.amount, source: payload.source }],
            ...(result.triggered_level_up
              ? { levelUpQueue: [...s.levelUpQueue, { newLevel: result.profile.level }] }
              : {}),
          }));
        }
      }
      return result;
    } catch (error) {
      const message = (error as any)?.message ?? 'Failed to award XP';
      const statusCode = (error as any)?.statusCode ?? 500;
      const gamificationError: GamificationError = {
        type: 'SERVER_ERROR',
        message,
        timestamp: new Date().toISOString(),
        statusCode,
      };
      set({ error: gamificationError });
      throw gamificationError;
    }
  },

  updateStreak: async (type) => {
    set({ error: null });
    try {
      const result = await updateStreakAction(type);
      if (result) {
        set((s) => ({
          profile: s.profile
            ? {
                ...s.profile,
                ...(type === 'login'
                  ? {
                      login_streak: result.current_streak,
                      longest_login_streak: result.longest_streak,
                    }
                  : {
                      learning_streak: result.current_streak,
                      longest_learning_streak: result.longest_streak,
                    }),
              }
            : null,
        }));
      }
    } catch (error) {
      const message = (error as any)?.message ?? 'Failed to update streak';
      const statusCode = (error as any)?.statusCode ?? 500;
      const gamificationError: GamificationError = {
        type: 'SERVER_ERROR',
        message,
        timestamp: new Date().toISOString(),
        statusCode,
      };
      set({ error: gamificationError });
      throw gamificationError;
    }
  },

  updatePreferences: async (preferences) => {
    set({ error: null });
    try {
      await updatePreferencesAction(preferences);
      set((s) => ({
        profile: s.profile ? { ...s.profile, preferences: { ...s.profile.preferences, ...preferences } } : null,
      }));
    } catch (error) {
      const message = (error as any)?.message ?? 'Failed to update preferences';
      const statusCode = (error as any)?.statusCode ?? 500;
      const gamificationError: GamificationError = {
        type: 'SERVER_ERROR',
        message,
        timestamp: new Date().toISOString(),
        statusCode,
      };
      set({ error: gamificationError });
      throw gamificationError;
    }
  },

  showXPToast: (amount, source) => set((s) => ({ pendingXPToasts: [...s.pendingXPToasts, { amount, source }] })),

  showLevelUpCelebration: (newLevel) => set((s) => ({ levelUpQueue: [...s.levelUpQueue, { newLevel }] })),

  dismissLevelUpCelebration: () => set((s) => ({ levelUpQueue: s.levelUpQueue.slice(1) })),

  consumeXPToasts: () => {
    const toasts = get().pendingXPToasts;
    set({ pendingXPToasts: [] });
    return toasts;
  },
}));

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectStreaks = (s: GamificationState) => ({
  login: s.profile?.login_streak ?? 0,
  learning: s.profile?.learning_streak ?? 0,
  maxLogin: s.profile?.longest_login_streak ?? 0,
  maxLearning: s.profile?.longest_learning_streak ?? 0,
});
