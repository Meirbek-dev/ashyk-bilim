import { apiJson } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'

export function createErrorEventId(): string {
  if (typeof globalThis.window !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

export function serializeClientError(error: unknown): Record<string, unknown> {
  if (isApiError(error)) {
    return {
      code: error.code,
      message: error.message,
      name: error.name,
      path: error.path,
      requestId: error.requestId,
      status: error.status,
      supportReference: error.requestId,
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown client error',
    valueType: typeof error,
  }
}

const MAX_FIELD_CHARS = 2000

/**
 * Stacks, component stacks and SSR error messages run to tens of KB (the
 * BUG-366 crash report was refused with 413); the route logs the first 1000
 * characters, so strings are clipped before sending (two levels deep: the
 * payload and its `error` object) - the body also stays under the 64 KiB
 * `keepalive` ceiling.
 */
function clipForLog(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > MAX_FIELD_CHARS ? `${value.slice(0, MAX_FIELD_CHARS)}…` : value
  if (depth < 2 && value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, clipForLog(inner, depth + 1)]))
  }
  return value
}

export async function reportClientError(payload: Record<string, unknown>): Promise<string> {
  const origin = typeof globalThis.window !== 'undefined' ? globalThis.location.origin : undefined
  const eventId = typeof payload.eventId === 'string' ? payload.eventId : createErrorEventId()

  await apiJson('/api/log-error', {
    body: JSON.stringify({
      ...(clipForLog(payload) as Record<string, unknown>),
      eventId,
      timestamp: new Date().toISOString(),
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    keepalive: true,
    method: 'POST',
    ...(origin ? { baseUrl: origin } : {}),
  })

  return eventId
}
