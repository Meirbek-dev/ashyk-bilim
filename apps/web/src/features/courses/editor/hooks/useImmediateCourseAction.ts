'use client'

import { getApiErrorMessage } from '@/lib/api/assertSuccess'
import { useCourseEditorStore } from '@/stores/courses'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

interface UseImmediateCourseActionOptions {
  successMessage?: string
  errorMessage?: string
  onSuccess?: () => void | Promise<void>
}

export function useImmediateCourseAction(options?: UseImmediateCourseActionOptions) {
  const [isPending, setIsPending] = useState(false)
  const setConflict = useCourseEditorStore(state => state.setConflict)

  const run = useCallback(
    async (action: () => Promise<unknown>, invocationOptions?: UseImmediateCourseActionOptions) => {
      setIsPending(true)
      try {
        const result = await action()
        const successMessage = invocationOptions?.successMessage ?? options?.successMessage
        if (successMessage) toast.success(successMessage)
        await invocationOptions?.onSuccess?.()
        await options?.onSuccess?.()
        return result
      } catch (error: unknown) {
        const apiError = error as AppApiError
        if (apiError.status === 409) {
          setConflict({
            serverVersion: (apiError.data as { update_date?: string | null } | null) ?? null,
            message: String(apiError.detail || apiError.message || ''),
            pendingSave: async () => {
              await run(action, invocationOptions)
            },
          })
          return undefined
        }

        const message =
          apiError.message ||
          getApiErrorMessage(apiError.data, invocationOptions?.errorMessage ?? options?.errorMessage ?? '')
        if (message) toast.error(message)
        return undefined
      } finally {
        setIsPending(false)
      }
    },
    [options, setConflict],
  )

  return { isPending, run }
}
