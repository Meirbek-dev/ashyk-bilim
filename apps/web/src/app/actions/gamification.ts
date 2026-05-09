'use server';
import { requireSession } from '@/lib/auth/session';

import {
  awardXPOnServer,
  getServerGamificationDashboard,
  getServerLeaderboard,
  updatePreferencesOnServer,
  updateStreakOnServer,
} from '@/services/gamification/server';
import type { DashboardData, PlatformLeaderboard, XPAwardRequest, XPAwardResponse } from '@/types/gamification';

export async function getDashboardDataAction(): Promise<DashboardData | null> {
  await requireSession();
  const data = await getServerGamificationDashboard();
  return data ?? null;
}

export async function getLeaderboardAction(limit = 20): Promise<PlatformLeaderboard | null> {
  await requireSession();
  const data = await getServerLeaderboard(limit);
  return data ?? null;
}

export async function awardXPAction(payload: XPAwardRequest): Promise<XPAwardResponse> {
  await requireSession();
  return awardXPOnServer(payload);
}

export async function updateStreakAction(type: 'login' | 'learning') {
  await requireSession();
  const result = await updateStreakOnServer(type);
  return result;
}

export async function updatePreferencesAction(preferences: Record<string, any>) {
  await requireSession();
  const result = await updatePreferencesOnServer(preferences);
  return result;
}
