'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { trailCurrentQueryOptions, trailLeaderboardQueryOptions } from '@/features/courses/queries/course.query';

function trailCurrentHookOptions(enabled = true) {
  return queryOptions({
    ...trailCurrentQueryOptions(),
    enabled,
  });
}

export function useTrailCurrent(options?: { enabled?: boolean }) {
  return useQuery(trailCurrentHookOptions(options?.enabled ?? true));
}

export function useTrailLeaderboard(limit = 10) {
  return useQuery(trailLeaderboardQueryOptions(limit));
}
