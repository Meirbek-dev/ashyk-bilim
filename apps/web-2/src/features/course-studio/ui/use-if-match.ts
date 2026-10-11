import { useRef, useState } from 'react'

import { isStale } from '../model/course'

/**
 * A write sent with `If-Match: version` (spec 7.6). A 412 opens the conflict dialog and rejects, so a form keeps its
 * input and stays unsaved (its leave guard still asks); "Reload and retry" reads the object's current `version` and
 * submits again: through the form when the dialog gets its submit, else the same input. Other errors close the dialog
 * and stay on the mutation.
 */
export function useIfMatch<Input>(
  send: (input: Input, version: number) => Promise<unknown>,
  reload: () => Promise<number>,
) {
  const [stale, setStale] = useState<{ input: Input } | null>(null)
  const [retrying, setRetrying] = useState(false)
  // The version "Reload and retry" just read, for the submit it starts (the page renders the reread a moment later).
  const reloaded = useRef<number | null>(null)
  const save = async (input: Input, version: number) => {
    const at = reloaded.current ?? version
    reloaded.current = null
    try {
      await send(input, at)
      setStale(null)
    } catch (error) {
      setStale(isStale(error) ? { input } : null)
      throw error
    }
  }
  /** The conflict dialog's props; `resubmit` is the form's submit (`() => form.handleSubmit()`), if there is a form. */
  const dialog = (resubmit?: () => Promise<unknown>) => ({
    open: stale !== null,
    onOpenChange: (open: boolean) => {
      if (!open) setStale(null)
    },
    onRetry: () => {
      if (!stale) return
      setRetrying(true)
      void reload()
        .then(current => {
          reloaded.current = current
          return resubmit ? resubmit() : save(stale.input, current)
        })
        // A failed resubmit shows on the form or the mutation; a failed read leaves the dialog to try again.
        .catch(() => undefined)
        .finally(() => setRetrying(false))
    },
    pending: retrying,
  })
  return { save, dialog }
}
