export const SEARCH_TYPES = ['all', 'courses', 'collections', 'users'] as const
export type SearchType = (typeof SEARCH_TYPES)[number]

/** `?type=` as a known filter; missing or unknown → `all` (BUG-382). */
export const parseSearchType = (value: string | null | undefined): SearchType =>
  SEARCH_TYPES.includes(value as SearchType) ? (value as SearchType) : 'all'
