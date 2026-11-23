import type { InferOutput } from 'valibot'

import { ApiError } from '#/shared/api/errors'
import type { AiRunId } from '#/shared/api/gen/types.gen'
import type { vRunStreamEvent } from '#/shared/api/gen/valibot.gen'

import { idleRun, isTerminal, runReducer, type RunAction, type RunState } from './run'

/**
 * One message of a run's stream: its SSE `id:` (a Redis stream id, or a marker: `run-started`, `seq-N`, `run-end`)
 * and its AG-UI event, `null` when the event does not match the contract (a newer server): its id still counts.
 */
export type RunStreamMessage = { id: string | null; event: InferOutput<typeof vRunStreamEvent> | null }

/** One connection to a run's stream (`transport.ts` `streamRun`; a fake in tests). */
export type Connect = (runId: AiRunId, cursor: string | null, signal: AbortSignal) => AsyncIterable<RunStreamMessage>

/** A run's message -> run actions: its stream id first, then what the event says (`ai.rs` `custom_event`). */
function actions({ id, event }: RunStreamMessage): RunAction[] {
  const cursor: RunAction[] = id === null ? [] : [{ type: 'cursor', id }]
  switch (event?.type) {
    case 'CUSTOM':
      return [...cursor, { type: 'progress', step: event.value.state }]
    case 'RUN_FINISHED':
      return [...cursor, { type: 'finished' }]
    case 'RUN_ERROR':
      return [...cursor, { type: 'error', code: event.code }]
    default:
      return cursor
  }
}

/**
 * Follows a queued run to its end: one connection, and on a drop another right away from the last stream id
 * (`Last-Event-ID`), until a terminal event, a refusal, `MAX_DROPS` drops in a row or the abort. Every action is
 * also reported to `dispatch` (the hook's state). Resolves with the final state; an abort rejects.
 */
export async function follow(
  runId: AiRunId,
  controller: AbortController,
  dispatch: (action: RunAction) => void,
  connect: Connect,
): Promise<RunState> {
  let state = runReducer(idleRun, { type: 'queued', runId })
  const step = (action: RunAction) => {
    state = runReducer(state, action)
    dispatch(action)
  }
  while (!isTerminal(state)) {
    try {
      for await (const message of connect(runId, state.cursor, controller.signal)) {
        for (const action of actions(message)) step(action)
      }
    } catch (error) {
      if (controller.signal.aborted) throw error
      // A refused connection (404, 429) is final; a network drop resumes.
      if (error instanceof ApiError) step({ type: 'error', code: error.code })
    }
    if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError')
    if (!isTerminal(state)) step({ type: 'ended' })
  }
  return state
}
