/**
 * Unified API error handling for mutation hooks.
 *
 * Replaces three near-identical helpers that existed across mutation files:
 *  - ensureMutationSuccess  (useCoursesMutations)
 *  - toError                (useActivityMutations)
 *  - ensureSuccess          (useChapterMutations — was broken: only threw on 409)
 */

export class APIError extends Error {
  public status: number
  public code: string
  public detail: unknown

  public constructor(response: unknown) {
    const r = response as Record<string, any> | null | undefined
    const data = typeof r?.['data'] === 'object' && r['data'] !== null ? r['data'] : undefined
    const message: string =
      (typeof data?.['detail'] === 'string' ? data['detail'] : null) ??
      formatIssueDetail(data?.['detail']) ??
      (typeof r?.['HTTPmessage'] === 'string' ? r['HTTPmessage'] : null) ??
      (typeof r?.['message'] === 'string' ? r['message'] : null) ??
      'Request failed'

    super(message)
    this.name = 'APIError'
    this.status = typeof r?.['status'] === 'number' ? r['status'] : 500
    this.code = typeof data?.['code'] === 'string' ? data['code'] : 'UNKNOWN'
    this.detail = data
  }
}

function formatIssueDetail(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object' || !('issues' in detail)) return null
  const { issues } = detail as { issues?: unknown }
  if (!Array.isArray(issues) || issues.length === 0) return null
  const firstMessages = issues
    .map(issue =>
      issue && typeof issue === 'object' ? (issue as { message?: unknown }).message : null,
    )
    .filter(
      (message): message is string => typeof message === 'string' && message.trim().length > 0,
    )
    .slice(0, 3)
  if (firstMessages.length === 0) return null
  const suffix =
    issues.length > firstMessages.length ? ` (+${issues.length - firstMessages.length})` : ''
  return `${firstMessages.join(' ')}${suffix}`
}

/**
 * Asserts that a service-layer response indicates success.
 * Throws {@link APIError} otherwise.
 *
 * Use this with functions that return `{success, status, data, ...}` (i.e.
 * those backed by `getResponseMetadata`).  Functions that use `errorHandling`
 * already throw on non-2xx, so you don't need this for them.
 */
export function assertSuccess<T extends { success?: boolean }>(response: T): T {
  if (response?.success) return response
  throw new APIError(response)
}
