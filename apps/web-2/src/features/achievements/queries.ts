import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import { dashboardOptions, leaderboardInfiniteQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { leaderboard } from '#/shared/api/gen/sdk.gen'
import type { Leaderboard } from '#/shared/api/gen/types.gen'

import { LEADERBOARD_PAGE, nextLeaderboardOffset } from './model/achievements'

/** Profile, the 10 latest XP awards and the viewer's rank; the same cache entry the settings page writes. */
export const achievementsOptions = () => dashboardOptions()

// Composed by hand like collectionsListOptions: the generated infinite options are not suspense-typed.
export const leaderboardListOptions = () => {
  const options = { query: { limit: LEADERBOARD_PAGE } }
  return infiniteQueryOptions<
    Leaderboard,
    ApiError,
    InfiniteData<Leaderboard>,
    ReturnType<typeof leaderboardInfiniteQueryKey>,
    number
  >({
    queryKey: leaderboardInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await leaderboard({
        query: { ...options.query, offset: pageParam },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: 0,
    getNextPageParam: nextLeaderboardOffset,
  })
}

/** Route loader of /achievements: both reads in parallel. */
export const ensureAchievements = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.ensureQueryData(achievementsOptions()),
    queryClient.ensureInfiniteQueryData(leaderboardListOptions()),
  ])
