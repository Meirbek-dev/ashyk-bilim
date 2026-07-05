'use client'

import type { APIError } from '@/lib/api/assertSuccess'
import type { SearchResult } from '@/lib/api/generated/api.schemas'
import { useApiSearchPlatformContentApiV1SearchGet } from '@/lib/api/generated/search/search'
import type { CustomResponseTyping } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query/queryKeys'

function toSearchResponse(data: SearchResult): CustomResponseTyping<SearchResult> {
  return {
    success: true,
    data,
    status: 200,
    HTTPmessage: 'OK',
  }
}

export function useSearchContent(query: string, options?: { page?: number; limit?: number; enabled?: boolean }) {
  const normalizedQuery = query.trim()
  const page = options?.page ?? 1
  const limit = options?.limit ?? 20

  return useApiSearchPlatformContentApiV1SearchGet<CustomResponseTyping<SearchResult>, APIError>(
    {
      query: normalizedQuery || '__disabled__',
      page,
      limit,
    },
    {
      query: {
        queryKey: queryKeys.search.content(normalizedQuery || '__disabled__', page, limit),
        enabled: (options?.enabled ?? true) && normalizedQuery.length > 0,
        select: toSearchResponse,
      },
    },
  )
}
