import { useRef, useState } from 'react'

import { isStale } from '../model/admin'

/**
 * The `version` a page's forms are based on (spec 7.6): the one loaded with the page, then the answer of each save
 * from this page. A refetch never moves it, so a change saved elsewhere since is a 412, not a silent overwrite.
 */
export type BaseVersion = [version: number, set: (version: number) => void]

/**
 * A form's write sent with `If-Match: <base version>`. A 412 opens the conflict dialog and fails the submit, so the
 * form keeps its input and stays unsaved (its leave guard still asks); "Reload and retry" reads the object's current
 * `version` and submits the form again. Other errors close the dialog and stay on the mutation.
 */
export function useIfMatch<Input>(
  [version, setVersion]: BaseVersion,
  send: (input: Input, version: number) => Promise<{ version: number } | void>,
  reload: () => Promise<number>,
) {
  const [stale, setStale] = useState(false)
  const [retrying, setRetrying] = useState(false)
  // The version "Reload and retry" just read, for the submit it starts (the state update lands a render later).
  const reloaded = useRef<number | null>(null)
  const save = async (input: Input) => {
    const at = reloaded.current ?? version
    reloaded.current = null
    try {
      const answer = await send(input, at)
      setVersion(answer ? answer.version : at)
      setStale(false)
    } catch (error) {
      setStale(isStale(error))
      throw error
    }
  }
  /** The conflict dialog's props; `resubmit` is the form's submit (`() => form.handleSubmit()`). */
  const dialog = (resubmit: () => Promise<unknown>) => ({
    open: stale,
    onOpenChange: (open: boolean) => {
      if (!open) setStale(false)
    },
    onRetry: () => {
      setRetrying(true)
      void reload()
        .then(current => {
          reloaded.current = current
          return resubmit()
        })
        // The form shows a failed resubmit (its mutation's error); a failed read leaves the dialog to try again.
        .catch(() => undefined)
        .finally(() => setRetrying(false))
    },
    pending: retrying,
  })
  return { save, dialog }
}
