import { ApiError } from '#/shared/api/errors'

/** Set on the rendered document; src/server.ts turns it into the HTTP status and drops it. */
export const SSR_STATUS_HEADER = 'x-ab-status'

/**
 * Root route `headers`: the router answers any route error with 500 during SSR; an ApiError keeps its own status,
 * so a 403 shown in place is a 403 document and a missing course a 404, not a server failure.
 */
export function ssrStatusHeaders({ matches }: { matches: readonly { error: unknown }[] }) {
  const error = matches.find(match => match.error instanceof ApiError)?.error
  return error instanceof ApiError ? { [SSR_STATUS_HEADER]: String(error.status) } : undefined
}
