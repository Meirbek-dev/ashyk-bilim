/**
 * Request-header helpers for the v2 contract conventions (ARCHITECTURE §6):
 *
 *  - `Idempotency-Key` on retry-safe mutating POSTs (submission submit, code
 *    runs, upload finalize, file-submission submit);
 *  - `If-Match: "<version>"` optimistic locks on submission draft saves
 *    (learner `draft_version`, 409 on mismatch), grade saves (teacher
 *    `version`, 412) and file-submission attempts;
 *  - the matching `ETag` response header carrying the new version.
 */

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'
export const IF_MATCH_HEADER = 'If-Match'
export const ETAG_HEADER = 'etag'

export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** `Idempotency-Key` header pair; reuse the same key when retrying one logical request. */
export function idempotencyHeaders(key: string = createIdempotencyKey()): Record<string, string> {
  return { [IDEMPOTENCY_KEY_HEADER]: key }
}

/** Quote a version for `If-Match` (the server compares the quoted form). */
export function formatEntityTag(version: number | string): string {
  const raw = String(version).trim()
  return raw.startsWith('"') ? raw : `"${raw.replace(/"/gu, '')}"`
}

/** `If-Match` header pair for an optimistic-lock write. */
export function ifMatchHeaders(version: number | string | null | undefined): Record<string, string> {
  if (version === null || version === undefined || version === '') return {}
  return { [IF_MATCH_HEADER]: formatEntityTag(version) }
}

/** Read a version back out of an `ETag` response header (`"7"` → 7). */
export function parseEntityTagVersion(headers: Record<string, string> | Headers | null | undefined): number | null {
  if (!headers) return null
  const raw = headers instanceof Headers ? headers.get(ETAG_HEADER) : (headers[ETAG_HEADER] ?? headers.ETag ?? null)
  if (!raw) return null
  const unquoted = raw.replace(/^W\//u, '').replace(/"/gu, '').trim()
  const version = Number.parseInt(unquoted, 10)
  return Number.isFinite(version) ? version : null
}
