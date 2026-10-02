import { ApiError } from '#/shared/api/errors'

export type ListStatus = 'loading' | 'forbidden' | 'error' | 'no-matches' | 'empty' | 'ready'

export type ListStatusInput = {
  pending: boolean
  error: unknown
  count: number
  /** A filter is in the URL: an empty result is "no matches", not "empty". */
  filtered: boolean
}

/** Which of the four data states (DESIGN 7) a list region shows. Data already on screen wins over a refetch. */
export function listStatus({ pending, error, count, filtered }: ListStatusInput): ListStatus {
  if (count > 0) return 'ready'
  if (error) return error instanceof ApiError && error.status === 403 ? 'forbidden' : 'error'
  if (pending) return 'loading'
  return filtered ? 'no-matches' : 'empty'
}
