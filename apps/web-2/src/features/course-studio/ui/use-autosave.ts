import { useDebouncer } from '@tanstack/react-pacer'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { use, useRef, useState } from 'react'

import type { EditorDocument } from '#/features/editor'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'

import { activityOptions, updateActivityOptions } from '../curriculum-queries'
import { isStale } from '../model/course'
import { SaveStatusContext } from './save-status'

/** Typing settles this long before the page is saved. */
const SAVE_WAIT_MS = 800

/**
 * Autosave of a page's content with `If-Match: version` (the cache holds the latest version after every save). One
 * request at a time: edits made while one is in flight go in the next. A 412 stops saving and opens the conflict
 * dialog; "reload and retry" reads the new version and saves the user's document over it. Nothing typed is dropped.
 */
export function useAutosave(courseId: string, activity: ActivityDetail) {
  const queryClient = useQueryClient()
  const report = use(SaveStatusContext)
  const save = useMutation(updateActivityOptions(queryClient, courseId))
  const [conflict, setConflict] = useState(false)
  const unsaved = useRef<EditorDocument | null>(null)
  const sending = useRef(false)
  const stopped = useRef(false)

  const version = () => queryClient.getQueryData(activityOptions(activity.id).queryKey)?.version ?? activity.version
  function send() {
    const doc = unsaved.current
    if (!doc || sending.current || stopped.current) return
    unsaved.current = null
    sending.current = true
    report(activity.id, 'saving')
    save.mutate(
      { path: { id: activity.id }, body: { content: doc }, headers: { 'If-Match': version() } },
      {
        onSuccess: () => {
          sending.current = false
          if (unsaved.current) send()
          else report(activity.id, 'saved')
        },
        onError: error => {
          sending.current = false
          unsaved.current ??= doc
          stopped.current = isStale(error)
          setConflict(stopped.current)
          report(activity.id, 'failed')
        },
      },
    )
  }
  // Leaving the page with edits still waiting for the pause saves them now.
  const later = useDebouncer(send, { wait: SAVE_WAIT_MS, onUnmount: debouncer => debouncer.flush() })
  const change = (doc: EditorDocument) => {
    unsaved.current = doc
    report(activity.id, 'dirty')
    later.maybeExecute()
  }
  const reloadAndRetry = async () => {
    await queryClient.fetchQuery({ ...activityOptions(activity.id), staleTime: 0 })
    stopped.current = false
    setConflict(false)
    send()
  }
  return { change, conflict, setConflict, reloadAndRetry, pending: save.isPending, error: conflict ? null : save.error }
}
