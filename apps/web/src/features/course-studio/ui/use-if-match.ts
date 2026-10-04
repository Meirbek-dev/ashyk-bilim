import { useState } from 'react'

import { isStale } from '../model/course'

/**
 * A write sent with `If-Match: version` (spec 7.6). A 412 keeps the input and opens the conflict dialog; "Reload
 * and retry" reads the object's current `version` and sends the same input again. Other errors stay on the mutation.
 */
export function useIfMatch<Input>(
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
