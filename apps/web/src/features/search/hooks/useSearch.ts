'use client'

import type { APIError } from '@/lib/api/assertSuccess'
import type { SearchResults } from '@/lib/api/generated/zod'
import { useSearch } from '@/lib/api/generated/search/search'

interface SearchQueryResult {
  data: SearchResults
}

function toSearchQueryResult(data: SearchResults): SearchQueryResult {
  return { data }
}

export function useSearchContent(query: string, options?: { limit?: number; enabled?: boolean }) {
  const normalizedQuery = query.trim()
  const limit = options?.limit ?? 20

  return useSearch<SearchQueryResult, APIError>(
    {
      q: normalizedQuery || '__disabled__',
      limit,
    },
    {
      query: {
        queryKey: ['search', 'content', normalizedQuery, limit],
        enabled: (options?.enabled ?? true) && normalizedQuery.length > 0,
        select: toSearchQueryResult,
      },
    },
  )
}
