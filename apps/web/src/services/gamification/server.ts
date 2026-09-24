'use server'

import type { DashboardData, PlatformLeaderboard, UserGamificationProfile } from '@/types/gamification'
import { gamificationTags } from '@/lib/cacheTags'
import { extractStreakInfo } from '@/types/gamification/profile'
import { getServerAPIUrl } from '@/services/config/config'
import { Dashboard, Leaderboard, Profile, StreakUpdate } from '@/lib/api/generated/zod'
import { fromUnix } from '@/lib/api/contract'
import { normalizeLeaderboard, normalizeProfile } from './normalize'
import { revalidateTag } from 'next/cache'
import { apiJson } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'

export async function getServerGamificationDashboard(): Promise<DashboardData | null> {
  try {
    const data = await apiJson(
      'gamification',
      {
        baseUrl: getServerAPIUrl(),
        timeoutMs: 8000,
      },
      value => Dashboard.parse(value),
    )
    const profile = normalizeProfile(data.profile)
    return {
      profile,
      recent_transactions: data.recent_transactions.map(transaction => ({
        ...transaction,
        source_id: transaction.source_id ?? null,
        created_at: fromUnix(transaction.created_at_unix).toISOString(),
      })),
      leaderboard: normalizeLeaderboard(data.leaderboard),
      user_rank: data.user_rank ?? null,
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
  const result = await apiJson(`gamification/streaks/${type}`, { method: 'POST' }, value => StreakUpdate.parse(value))
  revalidateGamificationTags()
  return result
}

/** `PATCH gamification/preferences` merges top-level keys and answers the full profile. */
export async function updatePreferencesOnServer(
  preferences: Record<string, unknown>,
): Promise<UserGamificationProfile> {
  const result = await apiJson(
    'gamification/preferences',
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences) },
    value => Profile.parse(value),
  )
  revalidateGamificationTags()
  return normalizeProfile(result)
}
