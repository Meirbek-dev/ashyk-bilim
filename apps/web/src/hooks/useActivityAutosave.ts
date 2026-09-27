'use client'

import { useActivityMutations } from '@/hooks/mutations/useActivityMutations'
import { hasErrorCode, isApiError } from '@/lib/api/assertSuccess'
import { useCourseEditorStore } from '@/stores/courses'
import { useCallback, useEffect, useRef } from 'react'

interface ActivityAutosaveOptions {
  activityUuid: string
  courseUuid: string
  delay?: number
}

// BUG-339: one save lane per activity. At most one write is in flight; newer
// payloads replace the queued one (their callers wait for it) and are sent
// with the version the previous write acknowledged. A debounced payload is
// bound to its activity, so a hook reused for another lesson never sends it
// there.
interface Lane {
  timer: ReturnType<typeof setTimeout> | null
  next: { payload: AppPayload; waiters: PromiseWithResolvers<void>[] } | null
  running: boolean
  version: number | null
}

export function useActivityAutosave(options: ActivityAutosaveOptions) {
  const { updateActivity } = useActivityMutations(options.courseUuid, true)
  const { activityUuid } = options
  const delay = options.delay ?? 1500
  // BUG-282: the store holds one activity's save state; any other activity
  // (a lesson opened in-app after a 412 elsewhere) starts from `idle`.
  const activitySave = useCourseEditorStore(state => state.activitySave)
  const own = activitySave.activityUuid === activityUuid
  const setStatus = useCourseEditorStore(state => state.setActivitySaveStatus)

  const updateRef = useRef(updateActivity)
  useEffect(() => {
    updateRef.current = updateActivity
  }, [updateActivity])

  // The activity `version` of the last save (UX-027): the loaded one until the
  // first save answers, then whatever the server handed back — per activity.
  // After a 412 (another tab saved first) this activity's autosave stops;
  // the notice offers a reload.
  const lanes = useRef(new Map<string, Lane>())
  const lane = useCallback((id: string) => {
    let found = lanes.current.get(id)
    if (!found) {
      found = { timer: null, next: null, running: false, version: null }
      lanes.current.set(id, found)
    }
    return found
  }, [])

  const drain = useCallback(
    async (id: string, entry: Lane) => {
      if (entry.running) return
      entry.running = true
      try {
        while (entry.next) {
          const { payload, waiters } = entry.next
          entry.next = null
          const current = useCourseEditorStore.getState().activitySave
          if (current.activityUuid === id && (current.status === 'conflict' || current.status === 'forbidden')) {
            for (const waiter of waiters) waiter.resolve()
            continue
          }
          setStatus(id, 'saving')
          try {
            const saved = await updateRef.current(id, {
              ...payload,
              version: entry.version ?? (typeof payload.version === 'number' ? payload.version : undefined),
            })
            if (typeof saved.version === 'number') entry.version = saved.version
            if (!entry.next && !entry.timer) setStatus(id, 'saved')
            for (const waiter of waiters) waiter.resolve()
          } catch (error: unknown) {
            setStatus(
              id,
              hasErrorCode(error, 'precondition-failed')
                ? 'conflict'
                : isApiError(error) && error.status === 403
                  ? 'forbidden'
                  : 'error',
            )
            for (const waiter of waiters) waiter.reject(error)
          }
        }
      } finally {
        entry.running = false
      }
    },
    [setStatus],
  )

  const enqueue = useCallback(
    (id: string, payload: AppPayload) => {
      const entry = lane(id)
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = null
      const waiter = Promise.withResolvers<void>()
      entry.next = { payload, waiters: [...(entry.next?.waiters ?? []), waiter] }
      void drain(id, entry)
      return waiter.promise
    },
    [drain, lane],
  )

  const isConflicted = useCallback(() => {
    const current = useCourseEditorStore.getState().activitySave
    return current.activityUuid === activityUuid && (current.status === 'conflict' || current.status === 'forbidden')
  }, [activityUuid])

  useEffect(() => {
    const all = lanes.current
    return () => {
      for (const entry of all.values()) if (entry.timer) clearTimeout(entry.timer)
    }
  }, [])

  const onChange = useCallback(
    (payload: AppPayload) => {
      if (isConflicted()) return
      setStatus(activityUuid, 'saving')
      const entry = lane(activityUuid)
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = setTimeout(() => {
        entry.timer = null
        enqueue(activityUuid, payload).catch(() => undefined)
      }, delay)
    },
    [activityUuid, delay, enqueue, isConflicted, lane, setStatus],
  )

  // Manual Save: replaces the pending debounce and waits for its own write.
  const flush = useCallback(
    async (payload: AppPayload) => {
      if (isConflicted()) return
      await enqueue(activityUuid, payload)
    },
    [activityUuid, enqueue, isConflicted],
  )

  return {
    flush,
    onChange,
    lastSavedAt: own ? activitySave.savedAt : null,
    saveStatus: own ? activitySave.status : 'idle',
  }
}
