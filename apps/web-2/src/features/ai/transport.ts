import { HttpAgent } from '@ag-ui/client'

import { client } from '#/shared/api/gen/client.gen'
import type { AiRunId, CourseId, QaChatData, StreamRunData } from '#/shared/api/gen/types.gen'

// The two streaming operations (spec 7.7): POST + AG-UI through `@ag-ui/client`, over the SDK's own fetch (the
// same origin swap and the same `ApiError` for a refused request). The generated `sse.post` cannot carry them: it
// validates each event as the contract's `string` body and retries on timers.

/** The bytes pass through untouched; each complete `id:` line is reported (the AG-UI parser drops them). */
function observeEventIds(body: ReadableStream<Uint8Array>, onId: (id: string) => void) {
  const decoder = new TextDecoder()
  let tail = ''
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const lines = (tail + decoder.decode(chunk, { stream: true })).split(/\r?\n/)
        tail = lines.pop() ?? ''
        for (const line of lines) if (line.startsWith('id:')) onId(line.slice(3).trim())
        controller.enqueue(chunk)
      },
    }),
  )
}

// The `qaChat` and `streamRun` operations, spoken by the AG-UI client rather than the generated SDK.
const QA_CHAT: QaChatData['url'] = '/api/v2/ai/qa/{course_id}/chat'
const RUN_STREAM: StreamRunData['url'] = '/api/v2/ai/runs/{run_id}/stream'

function agent(url: string, headers: Record<string, string>, onId?: (id: string) => void): HttpAgent {
  const send = client.getConfig().fetch
  if (!send) throw new Error('the SDK client has no fetch (shared/api/client.ts)')
  return new HttpAgent({
    url,
    headers,
    fetch: async (input, init) => {
      const response = await send(input, init)
      if (!onId || !response.body) return response
      return new Response(observeEventIds(response.body, onId), { status: response.status, headers: response.headers })
    },
  })
}

/** `POST /ai/qa/{course_id}/chat`: one Q&A turn. */
export const qaChat = (courseId: CourseId) =>
  agent(client.buildUrl({ url: QA_CHAT, path: { course_id: courseId } }), {})

/** `POST /ai/runs/{run_id}/stream`: a run's events, after `cursor` (`Last-Event-ID`) when resuming. */
export const streamRun = (runId: AiRunId, cursor: string | null, onId: (id: string) => void) =>
  agent(client.buildUrl({ url: RUN_STREAM, path: { run_id: runId } }), cursor ? { 'Last-Event-ID': cursor } : {}, onId)
