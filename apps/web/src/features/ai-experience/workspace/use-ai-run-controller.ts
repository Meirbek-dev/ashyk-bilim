'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'

import { useAIRunStatus } from '../api/use-ai-run-status'
import type { AIRunStatusPayload } from '../api/use-ai-run-status'
import { useAIRunStream } from '../api/use-ai-run-stream'
import { useCancelAIRun } from '../api/use-cancel-ai-run'
import { isTerminalAIState } from '../lib/ai-run-state'

export interface AIArtifactPayload<T = unknown> {
  artifact_uuid: string
  kind: string
  content_json: T
  final: boolean
}

export function aiRunArtifactsQueryOptions<T = unknown>(runUuid: string, enabled: boolean) {
  return {
    queryKey: ['ai-run-artifacts', runUuid],
    queryFn: () => apiJson<AIArtifactPayload<T>[]>(`ai/runs/${runUuid}/artifacts`),
    enabled: enabled && Boolean(runUuid),
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
  const [runUuid, setRunUuid] = useState<string | null>(() => {
    if (!persistenceKey || typeof globalThis.sessionStorage === 'undefined') return null
    return globalThis.sessionStorage.getItem(`ai-run:${persistenceKey}`)
  })
  const invalidatedRunUuidRef = useRef<string | null>(null)
  const queryClient = useQueryClient()
  const stream = useAIRunStream(runUuid ? `ai/runs/${runUuid}/stream` : null)
  const status = useAIRunStatus(runUuid ?? '', Boolean(runUuid))
  const cancel = useCancelAIRun()
  const terminalStatusState =
    status.data?.status === 'finished'
      ? 'complete'
      : status.data?.status === 'error'
        ? 'failed'
        : status.data?.status === 'aborted'
          ? 'cancelled'
          : null
  const state = terminalStatusState ?? stream.state
  const terminal = isTerminalAIState(state)
  const artifacts = useQuery(aiRunArtifactsQueryOptions<Artifact>(runUuid ?? '', Boolean(runUuid && terminal)))

  useEffect(() => {
    if (!terminal || !runUuid) return
    if (invalidatedRunUuidRef.current === runUuid) return
    invalidatedRunUuidRef.current = runUuid

    for (const queryKey of invalidateQueryKeys) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }, [invalidateQueryKeys, queryClient, runUuid, terminal])

  useEffect(() => {
    if (!persistenceKey) return
    const key = `ai-run:${persistenceKey}`
    if (runUuid) globalThis.sessionStorage.setItem(key, runUuid)
    else globalThis.sessionStorage.removeItem(key)
  }, [persistenceKey, runUuid])

  const latestArtifact = useMemo(
    () => artifacts.data?.find(artifact => artifact.final) ?? artifacts.data?.[0],
    [artifacts.data],
  )

  async function start(payload: Payload) {
    const run = await queue.mutateAsync(payload)
    setRunUuid(run.run_uuid)
    return run
  }

  function cancelRun() {
    if (!runUuid) return
    cancel.mutate(runUuid)
  }

  return {
    artifacts,
    cancel: cancelRun,
    cancelMutation: cancel,
    events: stream.events,
    error: stream.error ?? queue.error ?? status.error ?? artifacts.error,
    latestArtifact,
    pending: queue.isPending || (Boolean(runUuid) && !terminal),
    queue,
    runStatus: status.data,
    runUuid,
    setRunUuid,
    start,
    state,
    terminal,
  }
}
