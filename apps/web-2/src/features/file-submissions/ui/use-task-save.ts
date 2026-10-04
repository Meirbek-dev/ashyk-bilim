import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ConfigPatch, FileSubmission } from '#/shared/api/gen/types.gen'
import { toast } from '#/shared/ui/toast'

import { taskOptions, updateTaskOptions } from '../queries'

const isStale = (error: unknown) => error instanceof ApiError && error.status === 412

/**
 * A studio section's save of the task (`PATCH`, B-FSB-20): sent with `If-Match: version` of the cached task. A 412
 * keeps the input and opens the conflict dialog; "Reload and retry" reads the task again and sends the same patch.
 */
export function useTaskSave(task: FileSubmission) {
  const queryClient = useQueryClient()
  const update = useMutation(updateTaskOptions(queryClient, task.activity_id))
  const [stale, setStale] = useState<ConfigPatch | null>(null)
  const [retrying, setRetrying] = useState(false)
  const save = async (body: ConfigPatch, version = task.version) => {
    try {
      await update.mutateAsync(
        { path: { file_submission_id: task.id }, body, headers: { 'If-Match': version ?? null } },
        { onSuccess: () => toast.add({ title: m.submission_saved() }) },
      )
      setStale(null)
    } catch (error) {
      if (!isStale(error)) throw error
      setStale(body)
    }
  }
  const retry = async () => {
    if (!stale) return
    setRetrying(true)
    try {
      const fresh = await queryClient.fetchQuery({ ...taskOptions(task.activity_id), staleTime: 0 })
      await save(stale, fresh?.version)
    } catch {
      // A non-412 answer closes the dialog; the section shows it from the mutation's `error`.
      setStale(null)
    } finally {
      setRetrying(false)
    }
  }
  return {
    save: (body: ConfigPatch) => save(body),
    pending: update.isPending,
    error: isStale(update.error) ? null : update.error,
    dialog: {
      open: stale !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setStale(null)
      },
      onRetry: () => void retry(),
      pending: retrying,
    },
  }
}
