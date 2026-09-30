export type PageSearchParams = Record<string, string | string[] | undefined>

export const getFirstSearchParamValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

export const getSearchParam = (searchParams: PageSearchParams, key: string): string | undefined =>
  getFirstSearchParamValue(searchParams[key])

/** `?page=` as a 1-based page: missing, non-numeric, zero or negative → 1 (UX-275). */
export const getPageParam = (searchParams: PageSearchParams): number =>
  Math.max(1, Number.parseInt(getSearchParam(searchParams, 'page') ?? '', 10) || 1)
