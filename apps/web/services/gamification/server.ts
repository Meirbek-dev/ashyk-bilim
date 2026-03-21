'use server';

// Server-only data fetchers with Next.js cacheComponents

import type { DashboardData, PlatformLeaderboard, UserGamificationProfile } from '@/types/gamification';
import { gamificationTag, gamificationTags } from '@/lib/cacheTags';
import { extractStreakInfo } from '@/types/gamification/profile';
import { CacheProfiles, cacheLife, cacheTag } from '@/lib/cache';
import { getServerAPIUrl } from '@/services/config/config';
import { revalidateTag } from 'next/cache';
import { auth } from '@/auth';

interface RawDashboardResponse {
  profile?: Record<string, unknown>;
  recent_transactions?: unknown[];
  user_rank?: number | null;
  leaderboard?: RawLeaderboardResponse | null;
}

interface RawLeaderboardResponse {
  entries?: unknown[];
  total_participants?: unknown;
  last_updated?: unknown;
}

const nowISO = () => new Date().toISOString();

const numberOr = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stringOrNull = (value: unknown) => (typeof value === 'string' ? value : null);

const recordOrEmpty = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

function normalizeProfile(payload: Record<string, unknown> | undefined): UserGamificationProfile | null {
  if (!payload) return null;
  const createdAt = stringOrNull(payload.created_at) ?? nowISO();
  const updatedAt = stringOrNull(payload.updated_at) ?? createdAt;

  const profile: UserGamificationProfile = {
    id: payload.id !== undefined ? numberOr(payload.id) : undefined,
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

function normalizeTransactions(transactions: unknown[] | undefined) {
  const fallbackDate = nowISO();
  return (Array.isArray(transactions) ? transactions : []).map((tx) => {
    const transaction = tx as Record<string, unknown>;
    return {
      id: numberOr(transaction.id),
      user_id: numberOr(transaction.user_id),
      amount: numberOr(transaction.amount),
      source: typeof transaction.source === 'string' ? transaction.source : 'unknown',
      source_id: transaction.source_id ?? null,
      triggered_level_up: Boolean(transaction.triggered_level_up),
      previous_level: numberOr(transaction.previous_level),
      created_at: stringOrNull(transaction.created_at) ?? fallbackDate,
    };
  });
}

function normalizeLeaderboard(payload?: RawLeaderboardResponse | null): PlatformLeaderboard {
  const fallbackDate = nowISO();
  const entries = Array.isArray(payload?.entries) ? payload?.entries : [];
  return {
    entries: entries.map((entry, index) => {
      const data = entry as Record<string, unknown>;
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
    last_updated: stringOrNull(payload?.last_updated) ?? fallbackDate,
  };
}

/**
 * Get access token from session without throwing
 * Returns null if no session or error occurs
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const session = await auth();
    const token = session?.tokens?.access_token;
    return token || null;
  } catch {
    // Silently fail for unauthorized users - this is expected behavior
    return null;
  }
}

async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Authentication required');
  return token;
}

/**
 * Cached fetch for unified gamification data
 * Uses `use cache` directive for cacheComponents
 */
async function fetchGamificationData(accessToken: string): Promise<RawDashboardResponse | null> {
  'use cache';
  cacheTag(gamificationTag.dashboard());
  cacheLife(CacheProfiles.realtime);

  try {
    const res = await fetch(`${getServerAPIUrl()}gamification/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return null;
      console.error(`Failed to fetch gamification data: ${res.status}`);
      return null;
    }
    return res.json();
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
async function fetchLeaderboardData(limit: number, accessToken: string): Promise<RawLeaderboardResponse | null> {
  'use cache';
  cacheTag(gamificationTag.leaderboard());
  cacheLife(CacheProfiles.realtime);

  try {
    const res = await fetch(`${getServerAPIUrl()}gamification/leaderboard?limit=${encodeURIComponent(String(limit))}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return null;
      console.error(`Failed to fetch leaderboard: ${res.status}`);
      return null;
    }

    return res.json();
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return null;
  }
}

/**
 * Fetch unified gamification data from API
 * Returns null if user is not authenticated or if fetch fails
 */
async function getUnifiedServerData(): Promise<RawDashboardResponse | null> {
  // Check if user is authenticated first
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return null; // Expected: user not authenticated
  }

  // Use the cached fetcher
  return fetchGamificationData(accessToken);
}

async function getUnifiedServerDataWithToken(accessToken?: string | null): Promise<RawDashboardResponse | null> {
  const resolvedAccessToken = accessToken ?? (await getAccessToken());
  if (!resolvedAccessToken) {
    return null;
  }

  return fetchGamificationData(resolvedAccessToken);
}

export async function getServerGamificationProfile(): Promise<UserGamificationProfile | null> {
  const json = await getUnifiedServerData();

  // Return null if no data (unauthorized or error)
  if (!json) {
    return null;
  }

  return normalizeProfile((json.profile ?? json) as Record<string, unknown> | undefined);
}

export async function getServerGamificationDashboard(accessToken?: string | null): Promise<DashboardData | null> {
  const json = await getUnifiedServerDataWithToken(accessToken);

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
export async function getServerLeaderboard(
  limit = 20,
  accessToken?: string | null,
): Promise<PlatformLeaderboard | null> {
  const resolvedAccessToken = accessToken ?? (await getAccessToken());
  if (!resolvedAccessToken) {
    return null; // Expected: user not authenticated
  }

  // Use the cached fetcher
  const json = await fetchLeaderboardData(limit, resolvedAccessToken);
  return normalizeLeaderboard(json);
}

// Server-only revalidation utility after successful mutations
export async function revalidateGamificationTags() {
  for (const tag of gamificationTags()) {
    revalidateTag(tag, 'max');
  }
}

// Server-side mutation helpers
export async function awardXPOnServer(payload: Record<string, any>) {
  const accessToken = await requireAccessToken();
  const body = {
    source: payload.source,
    source_id: payload.source_id,
    custom_amount: payload.custom_amount ?? payload.amount,
    idempotency_key: payload.idempotency_key,
  };
  const res = await fetch(`${getServerAPIUrl()}gamification/xp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to award XP: ${res.status}`);
  const json = await res.json();
  await revalidateGamificationTags();
  return json;
}

export async function updateStreakOnServer(type: 'login' | 'learning') {
  const accessToken = await requireAccessToken();
  const res = await fetch(`${getServerAPIUrl()}gamification/streaks/${encodeURIComponent(type)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to update streak: ${res.status}`);
  const json = await res.json();
  await revalidateGamificationTags();
  return json;
}

export async function updatePreferencesOnServer(preferences: Record<string, any>) {
  const accessToken = await requireAccessToken();
  const res = await fetch(`${getServerAPIUrl()}gamification/preferences`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preferences),
  });
  if (!res.ok) throw new Error(`Failed to update preferences: ${res.status}`);
  const json = await res.json();
  await revalidateGamificationTags();
  return json;
}
