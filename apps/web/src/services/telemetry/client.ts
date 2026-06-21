import { apiFetch } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'

export function createErrorEventId(): string {
  if (typeof window !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
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

export async function reportClientError(payload: Record<string, unknown>): Promise<string> {
  const origin = typeof globalThis.window !== 'undefined' ? globalThis.location.origin : undefined
  const eventId = typeof payload.eventId === 'string' ? payload.eventId : createErrorEventId()

  await apiFetch('/api/log-error', {
    body: JSON.stringify({
      ...payload,
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
