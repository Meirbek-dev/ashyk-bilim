import { useState } from 'react'

import { ApiError } from '#/shared/api/errors'

/** A 412: someone saved a grade on this work after the page loaded it (its `version` is stale). */
export const isStale = (error: unknown): boolean => error instanceof ApiError && error.status === 412

/**
 * A grade save sent with `If-Match: version` (spec 7.6, B-GRD-15). A 412 keeps the form and opens the conflict
 * dialog; "Reload and retry" reads the work's current `version` and sends the same action again. Other errors (409:
 * unscored items) stay on the mutation and show in place.
 */
export function useConflict<Input>(
  send: (input: Input, version: number) => Promise<unknown>,
  reload: () => Promise<number>,
) {
  const [stale, setStale] = useState<{ input: Input } | null>(null)
  const [retrying, setRetrying] = useState(false)
  const save = async (input: Input, version: number) => {
    try {
      await send(input, version)
      setStale(null)
    } catch (error) {
      if (!isStale(error)) throw error
      setStale({ input })
    }
  }
  const retry = async () => {
    if (!stale) return
    setRetrying(true)
    try {
      await save(stale.input, await reload())
    } catch {
      // A non-412 answer closes the dialog; the form shows it from the mutation's `error`.
      setStale(null)
    } finally {
      setRetrying(false)
    }
  }
  return {
    save,
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
