import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'

/** Set by src/server.ts on the request it hands to Start; read back while the router renders. */
export const NONCE_HEADER = 'x-ab-csp-nonce'

export const requestNonce = createIsomorphicFn()
  .server(() => getRequestHeader(NONCE_HEADER))
  .client(() => undefined)

/** Spec 7.12. `style-src 'unsafe-inline'` is deliberate: editors and charts inject styles. */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob: https:",
    'frame-src https:',
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}
