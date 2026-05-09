'use client';

import { searchContent } from '@/services/search/search';
import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

export interface SearchContentQueryInput {
  query: string;
  page?: number;
  limit?: number;
}

export function searchContentQueryOptions({ query, page = 1, limit = 20 }: SearchContentQueryInput) {
  return queryOptions({
    queryKey: queryKeys.search.content(query, page, limit),
    queryFn: () => searchContent({ query, page, limit }),
  });
}
