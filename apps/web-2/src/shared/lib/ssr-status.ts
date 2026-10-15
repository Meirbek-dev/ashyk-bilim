import { isNotFound } from '@tanstack/react-router'
import { createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'

import { ApiError } from '#/shared/api/errors'

/** Set on the rendered document; src/server.ts turns it into the HTTP status and drops it. */
export const SSR_STATUS_HEADER = 'x-ab-status'

/** The request id, or undefined in a lane that runs outside the request (no StartEvent): logging never throws. */
function requestId(): string | undefined {
  try {
    return getRequestHeader('x-request-id')
  } catch {
    return undefined
  }
}

/** A route error the document answers 5xx for, in the web server's log line format (src/server.ts). */
const logServerError = createServerOnlyFn((error: unknown) => {
  const entry = {
    level: 'error',
    msg: 'route error during SSR',
    request_id: requestId(),
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  }
  process.stdout.write(`${JSON.stringify(entry)}\n`)
})

/**
 * Root route `headers`: the router answers any route error with 500 during SSR; an ApiError keeps its own status,
 * so a 403 shown in place is a 403 document and a missing course a 404, not a server failure. A 5xx is logged.
 */
export function ssrStatusHeaders({ matches }: { matches: readonly { error: unknown }[] }) {
  const errors = matches.map(match => match.error).filter(error => error != null && !isNotFound(error))
  const failure = errors.find(error => !(error instanceof ApiError) || error.status >= 500)
  if (failure !== undefined) logServerError(failure)
  const apiError = errors.find(error => error instanceof ApiError)
  return apiError instanceof ApiError ? { [SSR_STATUS_HEADER]: String(apiError.status) } : undefined
}
