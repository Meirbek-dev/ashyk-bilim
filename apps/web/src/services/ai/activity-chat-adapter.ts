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

import { normalizeToUIMessage, stream } from '@tanstack/ai-client';
import { EventType } from '@ag-ui/core';
import { getAPIUrl } from '@services/config/config';
import type { TextPart } from '@tanstack/ai-client';
import { generateUUID } from '@/lib/utils';

/** Maximum buffer size (64 KB) to guard against a pathological server sending partial lines. */
const MAX_BUFFER_BYTES = 65_536;

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Cookie carrying the active app locale. */
const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

/** Supported SSE protocol version. */
export const ACTIVITY_CHAT_PROTOCOL_VERSION = 1;

let hasLoggedProtocolVersionMismatch = false;

export function parseActivitySseDataLine(line: string): Record<string, unknown> | null {
  if (!line.startsWith('data: ')) return null;

  try {
    return JSON.parse(line.slice(6)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function reconcileFinalMessageDelta(streamedText: string, finalContent: string): string {
  if (!finalContent) return '';
  if (!streamedText) return finalContent;
  if (finalContent === streamedText) return '';
  if (finalContent.startsWith(streamedText)) {
    return finalContent.slice(streamedText.length);
  }
  return '';
}

function readActiveLocale(): string | null {
  if (typeof document === 'undefined') return null;

  const prefix = `${LOCALE_COOKIE_NAME}=`;
  for (const rawCookie of document.cookie.split(';')) {
    const cookie = rawCookie.trim();
    if (!cookie.startsWith(prefix)) continue;

    const value = cookie.slice(prefix.length).trim();
    if (!value) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

interface ActivityChatAdapterOptions {
  activityUuid: string;
  getStatusMessage: (status: string) => string | null;
  /**
   * Provides the current session UUID from an external store (e.g. a React
   * ref in ActivityAIChatProvider) so it survives provider remounts.
   */
  getSessionUuid?: () => string | null;
  /** Persists the session UUID after the backend returns it. */
  setSessionUuid?: (uuid: string) => void;
}

export interface ActivityChatAdapter {
  /** The TanStack AI connection object to pass to `useChat`. */
  connection: ReturnType<typeof stream>;
  /** Aborts the current in-flight request (no-op if idle). */
  abort: () => void;
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
  getSessionUuid,
  setSessionUuid,
}: ActivityChatAdapterOptions): ActivityChatAdapter {
  // Fallback: keep a local closure variable for callers that don't provide
  // external getter/setter (e.g. AIEditorToolkit's standalone useChat).
  let _localSessionUuid: string | null = null;

  const readUuid = (): string | null => (getSessionUuid ? getSessionUuid() : _localSessionUuid);
  const writeUuid = (uuid: string) => {
    if (setSessionUuid) {
      setSessionUuid(uuid);
    } else {
      _localSessionUuid = uuid;
    }
  };

  // A single AbortController shared per-request. Recreated on each invocation.
  let currentController: AbortController | null = null;

  const abort = () => currentController?.abort();

  // Cast the factory to the parameter type expected by `stream()` so that
  // TypeScript does not try to unify our yield-inferred Zod objectOutputType
  // union against AGUIEvent's own Zod-inferred union — they are structurally
  // equivalent at runtime but the passthrough index signatures make them
  // incompatible at the type level.
  const connection = stream(async function* connection(messages, _data) {
    // Extract the last user message text from the UIMessage parts array.
    const lastUser = [...messages].toReversed().find((m) => m.role === 'user');
    const normalizedLastUser = lastUser ? normalizeToUIMessage(lastUser, () => generateUUID()) : null;
    const text =
      normalizedLastUser?.parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.content)
        .join('') ?? '';

    if (!text.trim()) return;

    // Route to the correct endpoint based on whether we have an active session.
    const sessionUuid = readUuid();
    const url = sessionUuid
      ? `${getAPIUrl()}ai/send/activity_chat_message_stream`
      : `${getAPIUrl()}ai/start/activity_chat_session_stream`;
    const body = sessionUuid
      ? { aichat_uuid: sessionUuid, message: text, activity_uuid: activityUuid }
      : { message: text, activity_uuid: activityUuid };

    // Compose user-abort + 30 s timeout into a single signal.
    currentController = new AbortController();
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = AbortSignal.any([currentController.signal, timeoutSignal]);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const activeLocale = readActiveLocale();
    if (activeLocale) {
      headers['X-Locale'] = activeLocale;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include',
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const runId = generateUUID();
    const messageId = generateUUID();
    const now = () => Date.now();

    let messageStarted = false;
    let streamedText = '';

    // activityUuid is the stable thread identifier for this chat session.
    yield { type: EventType.RUN_STARTED, threadId: activityUuid, runId, timestamp: now() };

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Guard against pathologically large buffers.
        if (buffer.length > MAX_BUFFER_BYTES) {
          buffer = '';
          continue;
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const event = parseActivitySseDataLine(line);
          if (!event) continue;

          if (
            typeof event.version === 'number' &&
            event.version !== ACTIVITY_CHAT_PROTOCOL_VERSION &&
            !hasLoggedProtocolVersionMismatch
          ) {
            hasLoggedProtocolVersionMismatch = true;
            console.warn(
              `Unsupported activity chat protocol version: ${String(event.version)}. Expected ${ACTIVITY_CHAT_PROTOCOL_VERSION}.`,
            );
          }

          switch (event.type) {
            case 'status': {
              if (event.aichat_uuid) writeUuid(event.aichat_uuid as string);
              const message =
                typeof event.status === 'string'
                  ? getStatusMessage(event.status)
                  : typeof event.message === 'string' && event.message.trim().length > 0
                    ? event.message
                    : null;
              if (message) {
                yield {
                  type: EventType.CUSTOM,
                  name: 'ai_status',
                  value: {
                    status: typeof event.status === 'string' ? event.status : null,
                    message,
                  },
                  timestamp: now(),
                };
              }
              break;
            }

            case 'delta':
            case 'chunk': {
              if (!messageStarted) {
                yield {
                  type: EventType.TEXT_MESSAGE_START,
                  messageId,
                  role: 'assistant',
                  timestamp: now(),
                };
                messageStarted = true;
              }
              if (event.content) {
                streamedText += event.content as string;
                yield {
                  type: EventType.TEXT_MESSAGE_CONTENT,
                  messageId,
                  delta: event.content as string,
                  timestamp: now(),
                };
              }
              break;
            }

            case 'final': {
              if (event.aichat_uuid) writeUuid(event.aichat_uuid as string);
              if (!messageStarted) {
                yield {
                  type: EventType.TEXT_MESSAGE_START,
                  messageId,
                  role: 'assistant',
                  timestamp: now(),
                };
                messageStarted = true;
              }
              const finalDelta = reconcileFinalMessageDelta(streamedText, (event.content as string) ?? '');
              if (finalDelta) {
                yield {
                  type: EventType.TEXT_MESSAGE_CONTENT,
                  messageId,
                  delta: finalDelta,
                  timestamp: now(),
                };
              }
              yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now() };
              yield { type: EventType.RUN_FINISHED, threadId: activityUuid, runId, timestamp: now() };
              return;
            }

            case 'error': {
              // Close an open message before signalling the error.
              if (messageStarted) {
                yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now() };
              }
              // RunErrorEvent is flat per AG-UI spec — message and code at top level.
              yield {
                type: EventType.RUN_ERROR,
                message: (event.error as string) ?? 'Streaming failed',
                code: event.error_code as string | undefined,
                timestamp: now(),
              };
              return;
            }

            default: {
              break;
            }
          }
        }
      }

      // Stream ended without a `final` or `error` event (server closed connection
      // unexpectedly). Emit the missing protocol events so useChat doesn't hang.
      if (messageStarted) {
        yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now() };
      }
      yield { type: EventType.RUN_FINISHED, threadId: activityUuid, runId, timestamp: now() };
    } finally {
      reader.releaseLock();
      currentController = null;
    }
  } as Parameters<typeof stream>[0]);

  return { connection, abort };
}
