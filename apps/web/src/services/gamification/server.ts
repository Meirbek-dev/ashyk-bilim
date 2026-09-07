'use server'

import type { DashboardData, PlatformLeaderboard, UserGamificationProfile } from '@/types/gamification'
import { gamificationTags } from '@/lib/cacheTags'
import { extractStreakInfo } from '@/types/gamification/profile'
import { getServerAPIUrl } from '@/services/config/config'
import { Dashboard, Leaderboard, StreakUpdate } from '@/lib/api/generated/zod'
import type { Profile } from '@/lib/api/generated/zod'
import { fromUnix, unixToIso } from '@/lib/api/contract'
import { getContentUrl } from '@/services/media/media'
import { revalidateTag } from 'next/cache'
import { apiJson } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'

function normalizeProfile(profile: Profile): UserGamificationProfile {
  return {
    ...profile,
    created_at: fromUnix(profile.created_at_unix).toISOString(),
    updated_at: fromUnix(profile.updated_at_unix).toISOString(),
    last_xp_award_date: unixToIso(profile.last_xp_award_at_unix),
    last_login_date: unixToIso(profile.last_login_at_unix),
    last_learning_date: unixToIso(profile.last_learning_at_unix),
  }
}

function normalizeLeaderboard(leaderboard: Leaderboard): PlatformLeaderboard {
  return {
    entries: leaderboard.entries.map(entry => ({
      user_id: entry.user_id,
      username: entry.username,
      display_name: entry.display_name,
      total_xp: entry.total_xp,
      level: entry.level,
      rank: entry.rank,
      avatar_url: entry.avatar_key ? getContentUrl(entry.avatar_key) : null,
    })),
    total_participants: leaderboard.total_participants,
    last_updated: new Date().toISOString(),
  }
}

export async function getServerGamificationDashboard(): Promise<DashboardData | null> {
  try {
    const data = await apiJson('gamification', {
      baseUrl: getServerAPIUrl(),
      timeoutMs: 8000,
    }, value => Dashboard.parse(value));
    const profile = normalizeProfile(data.profile)
    return {
      profile,
      recent_transactions: data.recent_transactions.map(transaction => ({
        ...transaction,
        source_id: transaction.source_id ?? null,
        created_at: fromUnix(transaction.created_at_unix).toISOString(),
      })),
      leaderboard: normalizeLeaderboard(data.leaderboard),
      user_rank: data.user_rank,
      streak_info: extractStreakInfo(profile),
    }
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) return null
    throw error
  }
}

export async function getServerLeaderboard(limit = 20): Promise<PlatformLeaderboard | null> {
  try {
    const data = await apiJson(
      `gamification/leaderboard?limit=${encodeURIComponent(String(limit))}`,
      { baseUrl: getServerAPIUrl(), timeoutMs: 8000 },
      value => Leaderboard.parse(value),
    )
    return normalizeLeaderboard(data)
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) return null
    throw error
  }
}

function revalidateGamificationTags() {
  for (const tag of gamificationTags()) revalidateTag(tag, 'max')
}

export async function updateStreakOnServer(type: 'login' | 'learning'): Promise<StreakUpdate> {
  const result = await apiJson(
    `gamification/streaks/${type}`,
    { method: 'POST' },
    value => StreakUpdate.parse(value),
  )
  revalidateGamificationTags()
  return result
}

export async function updatePreferencesOnServer(preferences: Record<string, unknown>) {
  const result = await apiJson('gamification/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  })
  revalidateGamificationTags()
  return result
}
