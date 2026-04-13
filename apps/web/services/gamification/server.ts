'use server';

// Server-only data fetchers with Next.js cacheComponents

import type {
  DashboardData,
  PlatformLeaderboard,
  StreakUpdate,
  UserGamificationProfile,
  XPAwardRequest,
  XPAwardResponse,
} from '@/types/gamification';
import { gamificationTags } from '@/lib/cacheTags';
import { extractStreakInfo } from '@/types/gamification/profile';
import { getServerAPIUrl } from '@/services/config/config';
import type { components } from '@/lib/api/generated';
import { revalidateTag } from 'next/cache';
import { apiFetch } from '@/lib/api-client';

type ApiDashboardResponse = components['schemas']['DashboardRead'];
type ApiLeaderboardResponse = components['schemas']['LeaderboardRead'];
type ApiProfileResponse = components['schemas']['ProfileRead'];
type ApiTransactionResponse = components['schemas']['TransactionRead'];
type ApiXPAwardRequest = components['schemas']['XPAwardRequest'];
type ApiXPAwardResponse = components['schemas']['XPAwardResponse'];
type ApiStreakUpdateResponse = components['schemas']['StreakUpdateRead'];

const nowISO = () => new Date().toISOString();

const numberOr = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stringOrNull = (value: unknown) => (typeof value === 'string' ? value : null);

const recordOrEmpty = (value: Record<string, unknown> | null | undefined): Record<string, unknown> => value ?? {};

function normalizeProfile(payload: ApiProfileResponse | undefined): UserGamificationProfile | null {
  if (!payload) return null;
  const createdAt = stringOrNull(payload.created_at) ?? nowISO();
  const updatedAt = stringOrNull(payload.updated_at) ?? createdAt;

  const profile: UserGamificationProfile = {
    id: undefined,
    user_id: numberOr(payload.user_id),
    total_xp: Math.max(0, numberOr(payload.total_xp)),
    level: Math.max(1, numberOr(payload.level, 1)),
    login_streak: Math.max(0, numberOr(payload.login_streak)),
    learning_streak: Math.max(0, numberOr(payload.learning_streak)),
    longest_login_streak: Math.max(0, numberOr(payload.longest_login_streak)),
    longest_learning_streak: Math.max(0, numberOr(payload.longest_learning_streak)),
    total_activities_completed: Math.max(0, numberOr(payload.total_activities_completed)),
    total_courses_completed: Math.max(0, numberOr(payload.total_courses_completed)),
    daily_xp_earned: Math.max(0, numberOr(payload.daily_xp_earned)),
    xp_to_next_level: payload.xp_to_next_level !== undefined ? numberOr(payload.xp_to_next_level) : undefined,
    level_progress_percent:
      payload.level_progress_percent !== undefined ? numberOr(payload.level_progress_percent) : undefined,
    xp_in_current_level: payload.xp_in_current_level !== undefined ? numberOr(payload.xp_in_current_level) : undefined,
    last_xp_award_date: stringOrNull(payload.last_xp_award_date),
    last_login_date: stringOrNull(payload.last_login_date),
    last_learning_date: stringOrNull(payload.last_learning_date),
    created_at: createdAt,
    updated_at: updatedAt,
    preferences: recordOrEmpty(payload.preferences),
  };

  return profile;
}

function normalizeTransactions(transactions: ApiTransactionResponse[] | undefined) {
  const fallbackDate = nowISO();
  return (transactions ?? []).map((transaction) => ({
    id: numberOr(transaction.id),
    user_id: numberOr(transaction.user_id),
    amount: numberOr(transaction.amount),
    source: typeof transaction.source === 'string' ? transaction.source : 'unknown',
    source_id: transaction.source_id ?? null,
    triggered_level_up: transaction.triggered_level_up,
    previous_level: numberOr(transaction.previous_level),
    created_at: stringOrNull(transaction.created_at) ?? fallbackDate,
  }));
}

function normalizeLeaderboard(payload?: ApiLeaderboardResponse | null): PlatformLeaderboard {
  const fallbackDate = nowISO();
  const entries = payload?.entries ?? [];
  return {
    entries: entries.map((data, index) => {
      return {
        user_id: numberOr(data.user_id),
        total_xp: Math.max(0, numberOr(data.total_xp)),
        level: Math.max(1, numberOr(data.level, 1)),
        rank: Math.max(1, numberOr(data.rank, index + 1)),
        username: typeof data.username === 'string' ? data.username : null,
        first_name: 'first_name' in data ? ((data.first_name as string | null) ?? null) : null,
        last_name: 'last_name' in data ? ((data.last_name as string | null) ?? null) : null,
        avatar_url: 'avatar_url' in data ? ((data.avatar_url as string | null) ?? null) : null,
        rank_change: typeof data.rank_change === 'number' ? data.rank_change : undefined,
      };
    }),
    total_participants: Math.max(0, numberOr(payload?.total_participants)),
    last_updated: fallbackDate,
  };
}

/**
 * Cached fetch for unified gamification data
 * Uses `use cache` directive for cacheComponents
 */
async function fetchGamificationData(): Promise<ApiDashboardResponse | null> {
  try {
    const res = await apiFetch('gamification/', {
      method: 'GET',
      baseUrl: getServerAPIUrl(),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return null;
      console.error(`Failed to fetch gamification data: ${res.status}`);
      return null;
    }
    return (await res.json()) as ApiDashboardResponse;
  } catch (error) {
    if (error instanceof Error && !error.message.includes('fetch')) {
      console.error('Error fetching gamification data:', error);
    }
    return null;
  }
}

/**
 * Cached fetch for leaderboard data
 */
async function fetchLeaderboardData(limit: number): Promise<ApiLeaderboardResponse | null> {
  try {
    const res = await apiFetch(`gamification/leaderboard?limit=${encodeURIComponent(String(limit))}`, {
      method: 'GET',
      baseUrl: getServerAPIUrl(),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return null;
      console.error(`Failed to fetch leaderboard: ${res.status}`);
      return null;
    }

    return (await res.json()) as ApiLeaderboardResponse;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return null;
  }
}

/**
 * Fetch unified gamification data from API
 * Returns null if user is not authenticated or if fetch fails
 */
async function getUnifiedServerData(): Promise<ApiDashboardResponse | null> {
  return fetchGamificationData();
}

export async function getServerGamificationProfile(): Promise<UserGamificationProfile | null> {
  const json = await getUnifiedServerData();

  // Return null if no data (unauthorized or error)
  if (!json) {
    return null;
  }

  return normalizeProfile(json.profile);
}

export async function getServerGamificationDashboard(): Promise<DashboardData | null> {
  const json = await getUnifiedServerData();

  // Return null if no data (unauthorized or error)
  if (!json) {
    return null;
  }

  const profile = normalizeProfile(json.profile);
  if (!profile) {
    return null;
  }

  const userRank = json.user_rank === null || json.user_rank === undefined ? null : numberOr(json.user_rank);

  const dashboardData: DashboardData = {
    profile,
    recent_transactions: normalizeTransactions(json.recent_transactions),
    leaderboard: normalizeLeaderboard(json.leaderboard),
    user_rank: userRank,
    streak_info: extractStreakInfo(profile),
  };

  return dashboardData;
}

/**
 * Fetch platform leaderboard
 * Returns null if user is not authenticated or if fetch fails
 */
export async function getServerLeaderboard(limit = 20): Promise<PlatformLeaderboard | null> {
  const json = await fetchLeaderboardData(limit);
  return normalizeLeaderboard(json);
}

const normalizeAwardXpResponse = (payload: ApiXPAwardResponse): XPAwardResponse => ({
  transaction: {
    id: payload.transaction.id,
    user_id: payload.transaction.user_id,
    amount: payload.transaction.amount,
    source: payload.transaction.source,
    source_id: payload.transaction.source_id ?? null,
    triggered_level_up: payload.transaction.triggered_level_up,
    previous_level: payload.transaction.previous_level,
    created_at: payload.transaction.created_at,
  },
  profile: normalizeProfile(payload.profile)!,
  triggered_level_up: payload.level_up_occurred,
  previous_level: payload.previous_level,
});

const normalizeStreakUpdate = (payload: ApiStreakUpdateResponse): StreakUpdate => ({
  type: payload.streak_type as 'login' | 'learning',
  current_streak: payload.current_count,
  longest_streak: payload.longest_count,
  streak_maintained: true,
  streak_broken: false,
  bonus_xp_awarded: 0,
});

// Server-only revalidation utility after successful mutations
export async function revalidateGamificationTags() {
  for (const tag of gamificationTags()) {
    revalidateTag(tag, 'max');
  }
}

// Server-side mutation helpers
export async function awardXPOnServer(payload: XPAwardRequest): Promise<XPAwardResponse> {
  const body: ApiXPAwardRequest = {
    source: payload.source,
    source_id: payload.source_id,
    custom_amount: payload.amount,
    idempotency_key: payload.idempotency_key,
  };
  const res = await apiFetch('gamification/xp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to award XP: ${res.status}`);
  const json = (await res.json()) as ApiXPAwardResponse;
  await revalidateGamificationTags();
  return normalizeAwardXpResponse(json);
}

export async function updateStreakOnServer(type: 'login' | 'learning'): Promise<StreakUpdate> {
  const res = await apiFetch(`gamification/streaks/${encodeURIComponent(type)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to update streak: ${res.status}`);
  const json = (await res.json()) as ApiStreakUpdateResponse;
  await revalidateGamificationTags();
  return normalizeStreakUpdate(json);
}

export async function updatePreferencesOnServer(preferences: Record<string, any>) {
  const res = await apiFetch('gamification/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });
  if (!res.ok) throw new Error(`Failed to update preferences: ${res.status}`);
  const json = await res.json();
  await revalidateGamificationTags();
  return json;
}
