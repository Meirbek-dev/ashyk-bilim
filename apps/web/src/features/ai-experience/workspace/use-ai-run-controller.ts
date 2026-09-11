'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'

import { runArtifacts } from '@/lib/api/generated/ai/ai'
import { RunStatus } from '@/lib/api/generated/zod'
import type { RunArtifact } from '@/lib/api/generated/zod'

import { useAIRunStatus } from '../api/use-ai-run-status'
import type { AIRunStatusPayload } from '../api/use-ai-run-status'
import { useAIRunStream } from '../api/use-ai-run-stream'
import { useCancelAIRun } from '../api/use-cancel-ai-run'
import { isTerminalAIState } from '../lib/ai-run-state'
import type { AIWorkState } from '../lib/ai-run-state'

/** v2 `RunArtifact` with `content` narrowed to what the caller expects. */
export type AIArtifactPayload<T = unknown> = Omit<RunArtifact, 'content'> & { content: T }

export function aiRunArtifactsQueryOptions<T = unknown>(runId: string, enabled: boolean) {
  return {
    queryKey: ['ai-run-artifacts', runId],
    queryFn: async () => (await runArtifacts(runId)) as AIArtifactPayload<T>[],
    enabled: enabled && Boolean(runId),
  }
}

/** `RunStatus.status` → the UI vocabulary (`queued → running → {succeeded, failed, aborted}`). */
export function runStatusToWorkState(status: AIRunStatusPayload['status'] | undefined): AIWorkState | null {
  switch (status) {
    case 'succeeded': {
      return 'complete'
    }
    case 'failed': {
      return 'failed'
    }
    case 'aborted': {
      return 'cancelled'
    }
    default: {
      return null
    }
  }
}

type QueueMutation<Payload> = UseMutationResult<AIRunStatusPayload, Error, Payload>

export function useAIRunController<Payload, Artifact = unknown>({
  invalidateQueryKeys = [],
  persistenceKey,
  queue,
}: {
  invalidateQueryKeys?: unknown[][]
  persistenceKey?: string
  queue: QueueMutation<Payload>
}) {
  const [runId, setRunId] = useState<string | null>(() => {
    if (!persistenceKey || typeof globalThis.sessionStorage === 'undefined') return null
    return globalThis.sessionStorage.getItem(`ai-run:${persistenceKey}`)
  })
  const invalidatedRunIdRef = useRef<string | null>(null)
  const queryClient = useQueryClient()
  const stream = useAIRunStream(runId ? `ai/runs/${runId}/stream` : null)
  const status = useAIRunStatus(runId ?? '', Boolean(runId))
  const cancel = useCancelAIRun()
  const state = runStatusToWorkState(status.data?.status) ?? stream.state
  const terminal = isTerminalAIState(state)
  const artifacts = useQuery(aiRunArtifactsQueryOptions<Artifact>(runId ?? '', Boolean(runId && terminal)))

  useEffect(() => {
    if (!terminal || !runId) return
    if (invalidatedRunIdRef.current === runId) return
    invalidatedRunIdRef.current = runId

    for (const queryKey of invalidateQueryKeys) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }, [invalidateQueryKeys, queryClient, runId, terminal])

  useEffect(() => {
    if (!persistenceKey) return
    const key = `ai-run:${persistenceKey}`
    if (runId) globalThis.sessionStorage.setItem(key, runId)
    else globalThis.sessionStorage.removeItem(key)
  }, [persistenceKey, runId])

  const latestArtifact = useMemo(
    () => artifacts.data?.find(artifact => artifact.final) ?? artifacts.data?.[0],
    [artifacts.data],
  )

  async function start(payload: Payload) {
    // The queue hooks read `POST …/queue` untyped; the contract answers `RunStatus`.
    const run = RunStatus.parse(await queue.mutateAsync(payload))
    setRunId(run.id)
    return run
  }

  function cancelRun() {
    if (!runId) return
    cancel.mutate(runId)
  }

  return {
    artifacts,
    cancel: cancelRun,
    cancelMutation: cancel,
    events: stream.events,
    error: stream.error ?? queue.error ?? status.error ?? artifacts.error,
    latestArtifact,
    pending: queue.isPending || (Boolean(runId) && !terminal),
    queue,
    runStatus: status.data,
    runId,
    setRunId,
    start,
    state,
    terminal,
  }
}
