export type PageSearchParams = Record<string, string | string[] | undefined>

export const getFirstSearchParamValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value)

export const getSearchParam = (
  searchParams: PageSearchParams,
  key: string,
): string | undefined => getFirstSearchParamValue(searchParams[key])