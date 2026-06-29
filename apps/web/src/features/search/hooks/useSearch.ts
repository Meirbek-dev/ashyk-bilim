'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { searchContentQueryOptions } from '../queries/search.query'

export function useSearchContent(query: string, options?: { page?: number; limit?: number; enabled?: boolean }) {
  const normalizedQuery = query.trim()

  return useQuery(
    queryOptions({
      ...searchContentQueryOptions({
        query: normalizedQuery || '__disabled__',
        page: options?.page ?? 1,
        limit: options?.limit ?? 20,
      }),
      enabled: (options?.enabled ?? true) && normalizedQuery.length > 0,
    }),
  )
}
