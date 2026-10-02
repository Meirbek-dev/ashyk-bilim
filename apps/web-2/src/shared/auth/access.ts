import { ApiError } from '#/shared/api/errors'
import type { Capability, SessionInfo } from '#/shared/api/gen/types.gen'

// Capabilities are computed by the server (S-02); the client never derives them from roles or
// permission strings (R-06). This is the single place that reads them.

export function hasCapability(session: SessionInfo | null, capability: Capability): boolean {
  return session?.capabilities.includes(capability) ?? false
}

/** beforeLoad for capability-gated sections: a missing capability renders "no access" in place (403). */
export const requireCapability =
  (capability: Capability) =>
  ({ context }: { context: { session: SessionInfo | null } }): void => {
    if (!hasCapability(context.session, capability)) {
      throw new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })
    }
  }
