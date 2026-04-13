'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { searchContentQueryOptions } from '../queries/search.query';

function searchContentHookOptions(query: string, page = 1, limit = 20, enabled = true) {
  const normalizedQuery = query.trim();

  return queryOptions({
    ...searchContentQueryOptions({ query: normalizedQuery || '__disabled__', page, limit }),
    enabled: enabled && normalizedQuery.length > 0,
  });
}

export function useSearchContent(query: string, options?: { page?: number; limit?: number; enabled?: boolean }) {
  return useQuery(searchContentHookOptions(query, options?.page ?? 1, options?.limit ?? 20, options?.enabled ?? true));
}
