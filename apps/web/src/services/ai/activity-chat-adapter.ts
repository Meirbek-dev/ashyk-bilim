/**
 * Custom TanStack AI connection adapter for the Python/FastAPI backend.
 *
 * The backend emits a proprietary SSE format:
 *   data: {"type":"status","aichat_uuid":"...","message":"..."}
 *   data: {"type":"delta","content":"token"}
 *   data: {"type":"final","content":"full text","aichat_uuid":"..."}
 *   data: {"type":"error","error":"msg","error_code":"CODE"}
 *
 * This adapter translates those events into the AG-UI protocol (AGUIEvent)
 * that TanStack AI's ChatClient expects.
 */

import { normalizeToUIMessage, stream } from '@tanstack/ai-client'
import { EventType } from '@ag-ui/core'
import type { TextPart } from '@tanstack/ai-client'
import { apiStreamFetch } from '@/lib/api-client'
import { parseApiError } from '@/lib/api/assertSuccess'
import { generateUUID } from '@/lib/utils'

/** Maximum buffer size (64 KB) to guard against a pathological server sending partial lines. */
const MAX_BUFFER_BYTES = 65_536

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 300_000

/** Cookie carrying the active app locale. */
const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

/** Primary SSE protocol version for the redesigned AI runtime. */
export const ACTIVITY_CHAT_PROTOCOL_VERSION = 2

/** v1 remains supported while text deltas migrate to v2 message.delta. */
export const ACTIVITY_CHAT_LEGACY_PROTOCOL_VERSION = 1

const SUPPORTED_ACTIVITY_CHAT_PROTOCOL_VERSIONS = new Set<number>([
  ACTIVITY_CHAT_LEGACY_PROTOCOL_VERSION,
  ACTIVITY_CHAT_PROTOCOL_VERSION,
])

let hasLoggedProtocolVersionMismatch = false

interface ActivitySseEventBase {
  version?: number
}

interface ActivityStatusSseEvent extends ActivitySseEventBase {
  type: 'status'
  aichat_uuid?: string
  status?: string
  message?: string
}

interface ActivityDeltaSseEvent extends ActivitySseEventBase {
  type: 'delta' | 'chunk'
  content?: string
}

interface ActivityFinalSseEvent extends ActivitySseEventBase {
  type: 'final'
  aichat_uuid?: string
  content?: string
}

interface ActivityErrorSseEvent extends ActivitySseEventBase {
  type: 'error'
  error?: string
  error_code?: string
}

interface ActivityV2SseEvent extends ActivitySseEventBase {
  version: 2
  type:
    | 'run.started'
    | 'status.changed'
    | 'tool.started'
    | 'tool.delta'
    | 'tool.finished'
    | 'artifact.delta'
    | 'message.delta'
    | 'citation.added'
    | 'run.finished'
    | 'run.error'
    | 'run.aborted'
  event_id?: string
  run_id?: string
  thread_id?: string
  sequence?: number
  timestamp?: string
  payload?: unknown
}

type ActivitySseEvent =
  | ActivityStatusSseEvent
  | ActivityDeltaSseEvent
  | ActivityFinalSseEvent
  | ActivityErrorSseEvent
  | ActivityV2SseEvent

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const readOptionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const readOptionalNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

const readMessageDeltaContent = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null
  const delta = readOptionalString(payload.delta)
  if (delta) return delta
  const content = readOptionalString(payload.content)
  if (content) return content
  return readOptionalString(payload.text) ?? null
}

const parseActivitySseEvent = (value: unknown): ActivitySseEvent | null => {
  if (!isRecord(value)) return null

  const type = readOptionalString(value.type)
  const version = readOptionalNumber(value.version)
  const v2Types = new Set([
    'run.started',
    'status.changed',
    'tool.started',
    'tool.delta',
    'tool.finished',
    'artifact.delta',
    'message.delta',
    'citation.added',
    'run.finished',
    'run.error',
    'run.aborted',
  ])

  if (version === 2 && type && v2Types.has(type)) {
    const eventId = readOptionalString(value.event_id)
    const runId = readOptionalString(value.run_id)
    const threadId = readOptionalString(value.thread_id)
    const sequence = readOptionalNumber(value.sequence)
    const timestamp = readOptionalString(value.timestamp)
    return {
      type: type as ActivityV2SseEvent['type'],
      version,
      ...(eventId === undefined ? {} : { event_id: eventId }),
      ...(runId === undefined ? {} : { run_id: runId }),
      ...(threadId === undefined ? {} : { thread_id: threadId }),
      ...(sequence === undefined ? {} : { sequence }),
      ...(timestamp === undefined ? {} : { timestamp }),
      ...('payload' in value ? { payload: value.payload } : {}),
    }
  }

  switch (type) {
    case 'status': {
      const aichatUuid = readOptionalString(value.aichat_uuid)
      const status = readOptionalString(value.status)
      const message = readOptionalString(value.message)

      return {
        type,
        ...(version !== undefined ? { version } : {}),
        ...(aichatUuid === undefined ? {} : { aichat_uuid: aichatUuid }),
        ...(status === undefined ? {} : { status }),
        ...(message === undefined ? {} : { message }),
      }
    }
    case 'delta':
    case 'chunk': {
      const content = readOptionalString(value.content)

      return {
        type,
        ...(version !== undefined ? { version } : {}),
        ...(content === undefined ? {} : { content }),
      }
    }
    case 'final': {
      const aichatUuid = readOptionalString(value.aichat_uuid)
      const content = readOptionalString(value.content)

      return {
        type,
        ...(version !== undefined ? { version } : {}),
        ...(aichatUuid === undefined ? {} : { aichat_uuid: aichatUuid }),
        ...(content === undefined ? {} : { content }),
      }
    }
    case 'error': {
      const error = readOptionalString(value.error)
      const errorCode = readOptionalString(value.error_code)

      return {
        type,
        ...(version !== undefined ? { version } : {}),
        ...(error === undefined ? {} : { error }),
        ...(errorCode === undefined ? {} : { error_code: errorCode }),
      }
    }
    default: {
      return null
    }
  }
}

export function parseActivitySseDataLine(line: string): ActivitySseEvent | null {
  if (!line.startsWith('data: ')) return null

  try {
    return parseActivitySseEvent(JSON.parse(line.slice(6)))
  } catch {
    return null
  }
}

export function reconcileFinalMessageDelta(streamedText: string, finalContent: string): string {
  if (!finalContent) return ''
  if (!streamedText) return finalContent
  if (finalContent === streamedText) return ''
  if (finalContent.startsWith(streamedText)) {
    return finalContent.slice(streamedText.length)
  }
  return ''
}

function readActiveLocale(): string | null {
  if (typeof document === 'undefined') return null

  const prefix = `${LOCALE_COOKIE_NAME}=`
  for (const rawCookie of document.cookie.split(';')) {
    const cookie = rawCookie.trim()
    if (!cookie.startsWith(prefix)) continue

    const value = cookie.slice(prefix.length).trim()
    if (!value) return null

    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return null
}

interface ActivityChatAdapterOptions {
  activityUuid: string
  getStatusMessage: (status: string) => string | null
  getContextSnapshot?: () => Record<string, unknown> | null
  /**
   * Provides the current session UUID from an external store (e.g. a React
   * ref in ActivityAIChatProvider) so it survives provider remounts.
   */
  getSessionUuid?: () => string | null
  /** Persists the session UUID after the backend returns it. */
  setSessionUuid?: (uuid: string | null) => void
}

export interface ActivityChatAdapter {
  /** The TanStack AI connection object to pass to `useChat`. */
  connection: ReturnType<typeof stream>
  /** Aborts the current in-flight request (no-op if idle). */
  abort: () => void
  /** Sets the intent for the next request. */
  setIntent: (intent: string | null) => void
  /** Clears the current backend session UUID. */
  resetSession: () => void
}

/**
 * Creates a stateful connection adapter that bridges the Python backend's
 * SSE events to the AG-UI protocol used by TanStack AI.
 *
 * Session UUID is managed internally — the adapter automatically routes
 * to `/start` on first call and `/send` on subsequent calls.
 *
 * Returns both the TanStack `connection` and an `abort()` function so callers
 * can cancel in-flight requests on unmount or panel close.
 */
export function createActivityChatAdapter({
  activityUuid,
  getStatusMessage,
  getContextSnapshot,
  getSessionUuid,
  setSessionUuid,
}: ActivityChatAdapterOptions): ActivityChatAdapter {
  // Fallback: keep a local closure variable for callers that don't provide
  // external getter/setter (e.g. AIEditorToolkit's standalone useChat).
  let _localSessionUuid: string | null = null

  const readUuid = (): string | null => (getSessionUuid ? getSessionUuid() : _localSessionUuid)
  const writeUuid = (uuid: string | null) => {
    if (setSessionUuid) {
      setSessionUuid(uuid)
    } else {
      _localSessionUuid = uuid
    }
  }

  // A single AbortController shared per-request. Recreated on each invocation.
  let currentController: AbortController | null = null

  const abort = () => currentController?.abort()
  let currentIntent: string | null = null
  const setIntent = (intent: string | null) => {
    currentIntent = intent
  }
  const resetSession = () => {
    writeUuid(null)
  }

  // Cast the factory to the parameter type expected by `stream()` so that
  // TypeScript does not try to unify our yield-inferred Zod objectOutputType
  // union against AGUIEvent's own Zod-inferred union — they are structurally
  // equivalent at runtime but the passthrough index signatures make them
  // incompatible at the type level.
  const connection = stream(async function* connection(messages, _data) {
    // Extract the last user message text from the UIMessage parts array.
    const lastUser = [...messages].toReversed().find(m => m.role === 'user')
    const normalizedLastUser = lastUser ? normalizeToUIMessage(lastUser, () => generateUUID()) : null
    const text =
      normalizedLastUser?.parts
        .filter((p): p is TextPart => p.type === 'text')
        .map(p => p.content)
        .join('') ?? ''

    if (!text.trim()) return

    // Route to the correct endpoint based on whether we have an active session.
    const sessionUuid = readUuid()
    const intent = currentIntent ?? undefined
    const contextSnapshot = getContextSnapshot?.() ?? null
    const contextPayload = contextSnapshot ? { context_snapshot: contextSnapshot } : {}
    const url = sessionUuid ? 'ai/send/activity_chat_message_stream' : 'ai/start/activity_chat_session_stream'
    const body = sessionUuid
      ? {
          aichat_uuid: sessionUuid,
          message: text,
          activity_uuid: activityUuid,
          ...(intent ? { intent } : {}),
          ...contextPayload,
        }
      : { message: text, activity_uuid: activityUuid, ...(intent ? { intent } : {}), ...contextPayload }

    // Compose user-abort + 30 s timeout into a single signal.
    currentController = new AbortController()
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const signal = AbortSignal.any([currentController.signal, timeoutSignal])
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const activeLocale = readActiveLocale()
    if (activeLocale) {
      headers['X-Locale'] = activeLocale
    }

    const response = await apiStreamFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      throw await parseApiError(response, url)
    }

    const runId = generateUUID()
    const messageId = generateUUID()
    const now = () => Date.now()

    let activeRunId = runId
    let activeThreadId = activityUuid
    let messageStarted = false
    let streamedText = ''
    let hasV2MessageDelta = false

    const normalizeV2Event = (event: ActivityV2SseEvent): ActivityV2SseEvent => {
      const normalizedRunId = event.run_id ?? activeRunId
      const normalizedThreadId = event.thread_id ?? activeThreadId
      activeRunId = normalizedRunId
      activeThreadId = normalizedThreadId

      return {
        ...event,
        run_id: normalizedRunId,
        thread_id: normalizedThreadId,
        event_id: event.event_id ?? generateUUID(),
        sequence: event.sequence ?? 0,
        timestamp: event.timestamp ?? new Date(now()).toISOString(),
      }
    }

    // activityUuid is the stable thread identifier for this chat session.
    yield {
      type: EventType.RUN_STARTED,
      threadId: activityUuid,
      runId,
      timestamp: now(),
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Guard against pathologically large buffers.
        if (buffer.length > MAX_BUFFER_BYTES) {
          buffer = ''
          continue
        }

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const event = parseActivitySseDataLine(line)
          if (!event) continue

          if (
            event.version !== undefined &&
            !SUPPORTED_ACTIVITY_CHAT_PROTOCOL_VERSIONS.has(event.version) &&
            !hasLoggedProtocolVersionMismatch
          ) {
            hasLoggedProtocolVersionMismatch = true
            console.warn(
              `Unsupported activity chat protocol version: ${String(event.version)}. Supported versions: ${[
                ...SUPPORTED_ACTIVITY_CHAT_PROTOCOL_VERSIONS,
              ].join(', ')}.`,
            )
          }

          switch (event.type) {
            case 'status': {
              if (event.aichat_uuid) writeUuid(event.aichat_uuid)
              const message =
                typeof event.status === 'string'
                  ? getStatusMessage(event.status)
                  : typeof event.message === 'string' && event.message.trim().length > 0
                    ? event.message
                    : null
              if (message) {
                yield {
                  type: EventType.CUSTOM,
                  name: 'ai_status',
                  value: {
                    status: event.status ?? null,
                    message,
                  },
                  timestamp: now(),
                }
              }
              break
            }

            case 'delta':
            case 'chunk': {
              if (hasV2MessageDelta) {
                break
              }
              if (!messageStarted) {
                yield {
                  type: EventType.TEXT_MESSAGE_START,
                  messageId,
                  role: 'assistant',
                  timestamp: now(),
                }
                messageStarted = true
              }
              if (event.content) {
                streamedText += event.content
                yield {
                  type: EventType.TEXT_MESSAGE_CONTENT,
                  messageId,
                  delta: event.content,
                  timestamp: now(),
                }
              }
              break
            }

            case 'final': {
              if (event.aichat_uuid) writeUuid(event.aichat_uuid)
              if (!messageStarted) {
                yield {
                  type: EventType.TEXT_MESSAGE_START,
                  messageId,
                  role: 'assistant',
                  timestamp: now(),
                }
                messageStarted = true
              }
              const finalDelta = reconcileFinalMessageDelta(streamedText, event.content ?? '')
              if (!hasV2MessageDelta && finalDelta) {
                yield {
                  type: EventType.TEXT_MESSAGE_CONTENT,
                  messageId,
                  delta: finalDelta,
                  timestamp: now(),
                }
              }
              yield {
                type: EventType.TEXT_MESSAGE_END,
                messageId,
                timestamp: now(),
              }
              yield {
                type: EventType.RUN_FINISHED,
                threadId: activeThreadId,
                runId: activeRunId,
                timestamp: now(),
              }
              return
            }

            case 'error': {
              // Close an open message before signalling the error.
              if (messageStarted) {
                yield {
                  type: EventType.TEXT_MESSAGE_END,
                  messageId,
                  timestamp: now(),
                }
              }
              // RunErrorEvent is flat per AG-UI spec — message and code at top level.
              yield {
                type: EventType.RUN_ERROR,
                message: event.error ?? 'Streaming failed',
                ...(event.error_code ? { code: event.error_code } : {}),
                timestamp: now(),
              }
              return
            }

            case 'run.started':
            case 'status.changed':
            case 'tool.started':
            case 'tool.delta':
            case 'tool.finished':
            case 'artifact.delta':
            case 'message.delta':
            case 'citation.added':
            case 'run.finished':
            case 'run.error':
            case 'run.aborted': {
              const normalizedEvent = normalizeV2Event(event)
              yield {
                type: EventType.CUSTOM,
                name: normalizedEvent.type,
                value: normalizedEvent,
                timestamp: now(),
              }
              if (normalizedEvent.type === 'message.delta') {
                const delta = readMessageDeltaContent(normalizedEvent.payload)
                if (!delta) {
                  break
                }
                hasV2MessageDelta = true
                if (!messageStarted) {
                  yield {
                    type: EventType.TEXT_MESSAGE_START,
                    messageId,
                    role: 'assistant',
                    timestamp: now(),
                  }
                  messageStarted = true
                }
                streamedText += delta
                yield {
                  type: EventType.TEXT_MESSAGE_CONTENT,
                  messageId,
                  delta,
                  timestamp: now(),
                }
              }
              if (normalizedEvent.type === 'run.error') {
                if (messageStarted) {
                  yield {
                    type: EventType.TEXT_MESSAGE_END,
                    messageId,
                    timestamp: now(),
                  }
                }
                const payload = isRecord(normalizedEvent.payload) ? normalizedEvent.payload : {}
                yield {
                  type: EventType.RUN_ERROR,
                  message: readOptionalString(payload.message) ?? 'Streaming failed',
                  ...(readOptionalString(payload.code) ? { code: readOptionalString(payload.code) } : {}),
                  timestamp: now(),
                }
                return
              }
              break
            }

            default: {
              break
            }
          }
        }
      }

      // Stream ended without a `final` or `error` event (server closed connection
      // unexpectedly). Emit the missing protocol events so useChat doesn't hang.
      if (messageStarted) {
        yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now() }
      }
      yield {
        type: EventType.RUN_FINISHED,
        threadId: activeThreadId,
        runId: activeRunId,
        timestamp: now(),
      }
    } finally {
      reader.releaseLock()
      currentController = null
    }
  } as Parameters<typeof stream>[0])

  return { connection, abort, setIntent, resetSession }
}
