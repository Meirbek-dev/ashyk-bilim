'use server';

import {
  awardXPOnServer,
  getServerGamificationDashboard,
  getServerLeaderboard,
  updatePreferencesOnServer,
  updateStreakOnServer,
} from '@/services/gamification/server';
import type { DashboardData, PlatformLeaderboard, XPAwardRequest, XPAwardResponse } from '@/types/gamification';

export async function getDashboardDataAction(): Promise<DashboardData | null> {
  const data = await getServerGamificationDashboard();
  return data ?? null;
}

export async function getLeaderboardAction(limit = 20): Promise<PlatformLeaderboard | null> {
  const data = await getServerLeaderboard(limit);
  return data ?? null;
}

export async function awardXPAction(payload: XPAwardRequest): Promise<XPAwardResponse> {
  return awardXPOnServer(payload);
}

export async function updateStreakAction(type: 'login' | 'learning') {
  const result = await updateStreakOnServer(type);
  return result;
}

export async function updatePreferencesAction(preferences: Record<string, any>) {
  const result = await updatePreferencesOnServer(preferences);
  return result;
}
