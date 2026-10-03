import * as v from 'valibot'

import { ApiError } from '#/shared/api/errors'
import type { AiRunId } from '#/shared/api/gen/types.gen'
import { vRunEventState } from '#/shared/api/gen/valibot.gen'

import { idleRun, isTerminal, runReducer, type RunAction, type RunState } from './run'

/** The part of an AG-UI `AgentSubscriber` a run reads. */
export type RunEvents = {
  onCustomEvent: (params: { event: { value?: unknown } }) => void
  onRunFinishedEvent: () => void
  onRunErrorEvent: (params: { event: { code?: string | undefined } }) => void
}

/** One connection to a run's stream (`transport.ts` `streamRun`, an `HttpAgent`; a fake in tests). */
export type Connect = (
  runId: AiRunId,
  cursor: string | null,
  onId: (id: string) => void,
) => { runAgent(parameters: { abortController: AbortController }, subscriber: RunEvents): Promise<unknown> }

/** `CUSTOM.value` of a run event (`ai.rs` `custom_event`): only its `state` is read. */
const vCustomValue = v.object({ state: vRunEventState })

/** AG-UI events -> run actions. */
const subscriber = (step: (action: RunAction) => void): RunEvents => ({
  onCustomEvent: ({ event }) => {
    const value = v.safeParse(vCustomValue, event.value)
    if (value.success) step({ type: 'progress', step: value.output.state })
  },
  onRunFinishedEvent: () => step({ type: 'finished' }),
  onRunErrorEvent: ({ event }) => step({ type: 'error', code: event.code ?? 'AI_RUN_FAILED' }),
})

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
    const connection = connect(runId, state.cursor, id => step({ type: 'cursor', id }))
    try {
      await connection.runAgent({ abortController: controller }, subscriber(step))
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
