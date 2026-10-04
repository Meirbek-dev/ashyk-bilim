import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import {
  dashboardOptions,
  dashboardQueryKey,
  leaderboardInfiniteQueryKey,
  recordStreakMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { leaderboard } from '#/shared/api/gen/sdk.gen'
import type { Dashboard, Leaderboard, StreakUpdate } from '#/shared/api/gen/types.gen'

import { LEADERBOARD_PAGE } from './model/achievements'

/** Profile, the 10 latest XP awards and the viewer's rank; the same cache entry the settings page writes. */
export const achievementsOptions = () => dashboardOptions()

/**
 * Touches today's login streak. The answer carries both counts: the profile in the cache takes them, so /home does
 * not read the dashboard a second time (XP the touch awards arrives as `xp.awarded`).
 */
export const recordLoginOptions = (queryClient: QueryClient) => ({
  ...recordStreakMutation(),
  onSuccess: (streak: StreakUpdate) =>
    queryClient.setQueryData<Dashboard>(dashboardQueryKey(), dashboard =>
      dashboard
        ? {
            ...dashboard,
            profile: {
              ...dashboard.profile,
              login_streak: streak.current_count,
              longest_login_streak: streak.longest_count,
            },
          }
        : dashboard,
    ),
})

// Composed by hand like collectionsListOptions: the generated infinite options are not suspense-typed.
export const leaderboardListOptions = () => {
  const options = { query: { limit: LEADERBOARD_PAGE } }
  return infiniteQueryOptions<
    Leaderboard,
    ApiError,
    InfiniteData<Leaderboard>,
    ReturnType<typeof leaderboardInfiniteQueryKey>,
    string
  >({
    queryKey: leaderboardInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await leaderboard({
        query: { ...options.query, cursor: pageParam },
        signal,
        throwOnError: true,
      })
      return data
    },
    // Keyset paging: an empty cursor starts from the top; `next_cursor` is null on the last page.
    initialPageParam: '',
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

/** Route loader of /achievements: both reads in parallel. */
export const ensureAchievements = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.ensureQueryData(achievementsOptions()),
    queryClient.ensureInfiniteQueryData(leaderboardListOptions()),
  ])
