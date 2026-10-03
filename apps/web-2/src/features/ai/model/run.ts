import type { AiRunId, RunEventState } from '#/shared/api/gen/types.gen'

/**
 * One AI run as the UI sees it: queue -> stream -> finished / failed / cancelled. Pure: the hook feeds it the
 * queue answer and the AG-UI events of `POST /ai/runs/{id}/stream`; it decides when a dropped stream resumes.
 */
type RunPhase = 'idle' | 'starting' | 'streaming' | 'succeeded' | 'failed' | 'cancelled'

export type RunState = {
  phase: RunPhase
  runId: AiRunId | null
  /** The server's last progress step (`CUSTOM.value.state`): collecting context, checking evidence... */
  step: RunEventState | null
  /** The last Redis stream id (`1730000000000-0`): `Last-Event-ID` of the next connection. */
  cursor: string | null
  /** Connections in a row that closed without a terminal event and without progress. */
  drops: number
  /** `RUN_ERROR.code` or the refused request's `ApiError.code`. */
  errorCode: string | null
}

export type RunAction =
  | { type: 'start' }
  | { type: 'queued'; runId: AiRunId }
  | { type: 'cursor'; id: string }
  | { type: 'progress'; step: RunEventState }
  | { type: 'finished' }
  | { type: 'error'; code: string }
  | { type: 'ended' }

/** A dropped stream reconnects at once (no timers) this many times in a row, then the run shows an error. */
export const MAX_DROPS = 3
/** The code of a run whose stream kept dropping: the run may still finish on the server. */
export const STREAM_LOST = 'stream-lost'
/** `RUN_ERROR.code` of a cancelled run (`ai.rs` `terminal_event`). */
const CANCELLED = 'CANCELLED'
/** Only Redis stream ids resume a run; `run-started`, `seq-N` and `run-end` are markers. */
const STREAM_ID = /^\d+-\d+$/

export const idleRun: RunState = {
  phase: 'idle',
  runId: null,
  step: null,
  cursor: null,
  drops: 0,
  errorCode: null,
}

export const isTerminal = (state: RunState): boolean =>
  state.phase === 'succeeded' || state.phase === 'failed' || state.phase === 'cancelled'

export const isPending = (state: RunState): boolean => state.phase === 'starting' || state.phase === 'streaming'

export function runReducer(state: RunState, action: RunAction): RunState {
  if (action.type === 'start') return { ...idleRun, phase: 'starting' }
  if (action.type === 'queued') return { ...idleRun, phase: 'streaming', runId: action.runId }
  // A late event of a settled run (a replayed journal, a second tab) changes nothing.
  if (isTerminal(state)) return state
  switch (action.type) {
    case 'cursor':
      return STREAM_ID.test(action.id) ? { ...state, cursor: action.id, drops: 0 } : state
    case 'progress':
      return { ...state, step: action.step }
    case 'finished':
      return { ...state, phase: 'succeeded' }
    case 'error':
      return action.code === CANCELLED
        ? { ...state, phase: 'cancelled' }
        : { ...state, phase: 'failed', errorCode: action.code }
    case 'ended': {
      if (state.phase !== 'streaming') return state
      const drops = state.drops + 1
      return drops > MAX_DROPS ? { ...state, phase: 'failed', drops, errorCode: STREAM_LOST } : { ...state, drops }
    }
    default:
      return state
  }
}
