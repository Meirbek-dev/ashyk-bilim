import * as v from 'valibot'

import { client } from '#/shared/api/gen/client.gen'
import type {
  AiRunId,
  CourseId,
  QaChatData,
  QaChatRequest,
  QaForwardedProps,
  QaWireMessage,
  RunStreamRequest,
  StreamRunData,
} from '#/shared/api/gen/types.gen'
import { vQaChatEvent, vRunStreamEvent } from '#/shared/api/gen/valibot.gen'

import type { RunStreamMessage } from './model/follow'
import { readSse } from './model/sse'

// The two streaming operations (spec 7.7): a POST of an AG-UI `RunAgentInput` answered by an event stream of AG-UI
// events, read over the SDK's own fetch (the same origin swap and the same `ApiError` for a refused request). The
// generated `sse.post` cannot carry them: it validates each event as the contract's `string` body and retries on
// timers. Each `data:` is one event, checked against the contract's schema; an event that does not match (a newer
// server) comes as `null`. A network drop rejects the iteration; the abort signal stops it.

type QaChatEvent = v.InferOutput<typeof vQaChatEvent>

const QA_CHAT: QaChatData['url'] = '/api/v2/ai/qa/{course_id}/chat'
const RUN_STREAM: StreamRunData['url'] = '/api/v2/ai/runs/{run_id}/stream'

async function* post<S extends v.GenericSchema>(
  url: string,
  body: QaChatRequest | RunStreamRequest,
  headers: Record<string, string>,
  signal: AbortSignal,
  schema: S,
): AsyncGenerator<{ id: string | null; event: v.InferOutput<S> | null }> {
  const send = client.getConfig().fetch
  if (!send) throw new Error('the SDK client has no fetch (shared/api/client.ts)')
  const response = await send(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.body) return
  for await (const message of readSse(response.body)) {
    const event = v.safeParse(schema, parseJson(message.data))
    yield { id: message.id, event: event.success ? event.output : null }
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

type QaInput = { threadId: string; message: QaWireMessage; forwardedProps: QaForwardedProps }

/** `POST /ai/qa/{course_id}/chat`: one Q&A turn's events. */
export async function* qaChat(courseId: CourseId, input: QaInput, signal: AbortSignal): AsyncGenerator<QaChatEvent> {
  const url = client.buildUrl({ url: QA_CHAT, path: { course_id: courseId } })
  const body: QaChatRequest = {
    threadId: input.threadId,
    runId: crypto.randomUUID(),
    messages: [input.message],
    forwardedProps: input.forwardedProps,
  }
  for await (const { event } of post(url, body, {}, signal, vQaChatEvent)) if (event) yield event
}

/** `POST /ai/runs/{run_id}/stream`: a run's events, after `cursor` (`Last-Event-ID`) when resuming. */
export function streamRun(
  runId: AiRunId,
  cursor: string | null,
  signal: AbortSignal,
): AsyncGenerator<RunStreamMessage> {
  const url = client.buildUrl({ url: RUN_STREAM, path: { run_id: runId } })
  // AG-UI correlation ids, echoed back in `RUN_*` events; nothing here reads them.
  const body: RunStreamRequest = { threadId: runId, runId: crypto.randomUUID() }
  return post(url, body, cursor ? { 'Last-Event-ID': cursor } : {}, signal, vRunStreamEvent)
}
