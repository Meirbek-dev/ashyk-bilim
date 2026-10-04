import { useMutation, type QueryKey } from '@tanstack/react-query'
import { useEffect, useReducer, useRef } from 'react'

import { ApiError } from '#/shared/api/errors'
import { cancelRunMutation } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { RunStatus } from '#/shared/api/gen/types.gen'

import { follow } from '../model/follow'
import { idleRun, isPending, runReducer } from '../model/run'
import { streamRun } from '../transport'

/**
 * The one run lifecycle (spec 7.7): `queue` answers a `RunStatus`, then the run's AG-UI stream is followed to its
 * end (`model/follow.ts`). The whole queue -> stream -> finished is one mutation: a success invalidates the
 * caller's keys (`meta.invalidates`), so the `latest` reads refresh. Unmount or a new start aborts the stream (the
 * run itself goes on on the server); `cancel` asks the server to stop it.
 */
export function useAiRun<Vars>(queue: (vars: Vars) => Promise<RunStatus>, invalidates: QueryKey[]) {
  const [state, dispatch] = useReducer(runReducer, idleRun)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const run = useMutation({
    mutationFn: async (vars: Vars) => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      dispatch({ type: 'start' })
      let status: RunStatus
      try {
        status = await queue(vars)
      } catch (error) {
        dispatch({ type: 'error', code: error instanceof ApiError ? error.code : 'AI_RUN_FAILED' })
        throw error
      }
      dispatch({ type: 'queued', runId: status.id })
      const end = await follow(status.id, current, dispatch, streamRun)
      // A run that did not succeed fails the mutation: `meta.invalidates` is for successful runs only.
      if (end.phase !== 'succeeded') throw new Error(`AI run ${end.phase}`)
      return status
    },
    meta: { invalidates },
  })
  const cancel = useMutation(cancelRunMutation())
  return {
    state,
    pending: isPending(state),
    start: (vars: Vars) => run.mutate(vars),
    cancel: () => {
      if (state.runId) cancel.mutate({ path: { run_id: state.runId } })
    },
    cancelling: cancel.isPending,
  }
}
