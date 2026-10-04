import { useState } from 'react'

import { isStale } from '../model/admin'

/**
 * The `version` a page's forms are based on (spec 7.6): the one loaded with the page, then the answer of each save
 * from this page. A refetch never moves it, so a change saved elsewhere since is a 412, not a silent overwrite.
 */
export type BaseVersion = [version: number, set: (version: number) => void]

/**
 * A write sent with `If-Match: <base version>`. A 412 keeps the input and opens the conflict dialog; "Reload and
 * retry" reads the object's current `version` and sends the same input again. Other errors stay on the mutation.
 */
export function useIfMatch<Input>(
  [version, setVersion]: BaseVersion,
  send: (input: Input, version: number) => Promise<{ version: number } | void>,
  reload: () => Promise<number>,
) {
  const [stale, setStale] = useState<{ input: Input } | null>(null)
  const [retrying, setRetrying] = useState(false)
  const save = async (input: Input, at = version) => {
    try {
      const answer = await send(input, at)
      if (answer) setVersion(answer.version)
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
    save: (input: Input) => save(input),
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
