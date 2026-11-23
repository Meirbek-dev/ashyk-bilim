import { describe, expect, test } from 'vite-plus/test'

import { ApiError } from '#/shared/api/errors'
import type { RunEventState } from '#/shared/api/gen/types.gen'

import { follow, type Connect, type RunStreamMessage } from './follow'
import { idleRun, isPending, MAX_DROPS, runReducer, STREAM_LOST, type RunAction, type RunState } from './run'

const RUN = '0190a5d2-0000-7000-8000-0000000000aa'
const run = (...actions: RunAction[]): RunState => actions.reduce(runReducer, idleRun)

describe('runReducer', () => {
  test('B-AI-06 queue -> stream -> finished, with the server steps on the way', () => {
    const queued = run({ type: 'start' }, { type: 'queued', runId: RUN })
    expect(queued).toMatchObject({ phase: 'streaming', runId: RUN })
    expect(isPending(queued)).toBe(true)
    const step = runReducer(queued, { type: 'progress', step: 'checking_evidence' })
    expect(step.step).toBe('checking_evidence')
    expect(runReducer(step, { type: 'finished' }).phase).toBe('succeeded')
  })

  test('B-AI-06 only Redis stream ids move the resume cursor; progress resets the drop count', () => {
    let state = run({ type: 'queued', runId: RUN }, { type: 'ended' })
    expect(state.drops).toBe(1)
    state = runReducer(state, { type: 'cursor', id: 'run-started' })
    expect(state).toMatchObject({ cursor: null, drops: 1 })
    state = runReducer(state, { type: 'cursor', id: '1730000000000-3' })
    expect(state).toMatchObject({ cursor: '1730000000000-3', drops: 0 })
    expect(runReducer(state, { type: 'cursor', id: 'seq-4' }).cursor).toBe('1730000000000-3')
  })

  test(`B-AI-06 more than ${MAX_DROPS} drops in a row fail the run as a lost stream`, () => {
    const drops = Array.from({ length: MAX_DROPS + 1 }, (): RunAction => ({ type: 'ended' }))
    expect(run({ type: 'queued', runId: RUN }, ...drops)).toMatchObject({ phase: 'failed', errorCode: STREAM_LOST })
  })

  test('B-AI-07 B-AI-08 RUN_ERROR CANCELLED is a cancel; another code is a failure with that code', () => {
    const queued = run({ type: 'queued', runId: RUN })
    expect(runReducer(queued, { type: 'error', code: 'CANCELLED' }).phase).toBe('cancelled')
    expect(runReducer(queued, { type: 'error', code: 'ai-budget-exhausted' })).toMatchObject({
      phase: 'failed',
      errorCode: 'ai-budget-exhausted',
    })
  })

  test('B-AI-06 a late event of a settled run changes nothing; a new start resets', () => {
    const done = run({ type: 'queued', runId: RUN }, { type: 'finished' })
    expect(runReducer(done, { type: 'error', code: 'AI_RUN_FAILED' })).toBe(done)
    expect(runReducer(done, { type: 'ended' })).toBe(done)
    expect(runReducer(done, { type: 'start' })).toMatchObject({ phase: 'starting', runId: null })
  })
})

type Script = () => AsyncGenerator<RunStreamMessage>

/** A fake stream: each connection plays the next script; records the cursor it was opened with. */
function fakeConnect(scripts: Script[]) {
  const cursors: (string | null)[] = []
  const connect: Connect = (_runId, cursor) => {
    cursors.push(cursor)
    const script = scripts[cursors.length - 1]
    if (!script) throw new Error('no more connections expected')
    return script()
  }
  return { connect, cursors }
}

const custom = (id: string | null, state: RunEventState): RunStreamMessage => ({
  id,
  event: { type: 'CUSTOM', name: 'progress', value: { state, message: null, payload: { state } } },
})
const finished: RunStreamMessage = { id: 'run-end', event: { type: 'RUN_FINISHED', threadId: RUN, runId: 'r' } }

describe('follow', () => {
  test('B-AI-06 a dropped stream reconnects at once from the last stream id and reaches the end', async () => {
    const { connect, cursors } = fakeConnect([
      async function* () {
        yield custom('1730000000000-1', 'collecting_context')
        throw new TypeError('network error')
      },
      async function* () {
        yield finished
      },
    ])
    const seen: RunAction[] = []
    const end = await follow(RUN, new AbortController(), action => seen.push(action), connect)
    expect(end.phase).toBe('succeeded')
    expect(cursors).toEqual([null, '1730000000000-1'])
    expect(seen).toContainEqual({ type: 'progress', step: 'collecting_context' })
  })

  test('B-AI-06 a stream that closes without an end resumes; RUN_ERROR ends with its code', async () => {
    const { connect, cursors } = fakeConnect([
      async function* () {
        yield custom('1730000000000-2', 'checking_evidence')
      },
      async function* () {
        yield { id: 'run-end', event: { type: 'RUN_ERROR', code: 'ai-budget-exhausted', message: 'no budget' } }
      },
    ])
    const end = await follow(RUN, new AbortController(), () => undefined, connect)
    expect(end).toMatchObject({ phase: 'failed', errorCode: 'ai-budget-exhausted' })
    expect(cursors).toEqual([null, '1730000000000-2'])
  })

  test('B-AI-06 B-AI-08 a refused stream (ApiError) is final: no reconnect', async () => {
    const refused = new ApiError({
      status: 429,
      code: 'rate-limited',
      fieldErrors: [],
      requestId: null,
      retryAfter: null,
    })
    const { connect, cursors } = fakeConnect([
      // oxlint-disable-next-line require-yield -- a connection refused before its first event
      async function* () {
        throw refused
      },
    ])
    const end = await follow(RUN, new AbortController(), () => undefined, connect)
    expect(end).toMatchObject({ phase: 'failed', errorCode: 'rate-limited' })
    expect(cursors).toHaveLength(1)
  })

  test('B-AI-06 an abort (unmount, navigation) rejects and opens nothing more', async () => {
    const controller = new AbortController()
    const { connect, cursors } = fakeConnect([
      // oxlint-disable-next-line require-yield -- aborted before its first event
      async function* () {
        controller.abort()
        throw new DOMException('aborted', 'AbortError')
      },
    ])
    await expect(follow(RUN, controller, () => undefined, connect)).rejects.toThrow('aborted')
    expect(cursors).toHaveLength(1)
  })
})
