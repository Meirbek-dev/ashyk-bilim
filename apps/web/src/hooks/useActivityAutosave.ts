'use client'

import { useActivityMutations } from '@/hooks/mutations/useActivityMutations'
import { APIError, hasErrorCode, isApiError } from '@/lib/api/assertSuccess'
import { getActivity } from '@services/courses/activities'
import { useCourseEditorStore } from '@/stores/courses'
import { useCallback, useEffect, useRef } from 'react'

interface ActivityAutosaveOptions {
  activityUuid: string
  courseUuid: string
  delay?: number
  /** The content the loaded `version` carries (BUG-376: the rebase base before the first save). */
  loadedContent?: unknown
}

// BUG-339: one save lane per activity. At most one write is in flight; newer
// payloads replace the queued one (their callers wait for it) and are sent
// with the version the previous write acknowledged. A debounced payload is
// bound to its activity, so a hook reused for another lesson never sends it
// there. Once a 412/403 stops the lane, every save still waiting - and every
// later manual Save - rejects with that error: a write that did not happen
// never reports success.
interface Lane {
  timer: ReturnType<typeof setTimeout> | null
  next: { payload: AppPayload; waiters: PromiseWithResolvers<void>[] } | null
  running: boolean
  version: number | null
  /** Content the server holds at `version`, when known. */
  base: { content: unknown } | null
  stopped: unknown
}

// BUG-376: key order differs between the editor's JSON and jsonb's.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map(key => [key, canonical((value as Record<string, unknown>)[key])]),
  )
}

const sameContent = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

/**
 * BUG-376: every row write bumps the version (BUG-358), so a curriculum
 * rename or publish toggle 412s an open editor. A content-only save whose
 * base content is still what the server holds lost to a metadata edit, not
 * to another tab's text: answer the current version to retry with.
 */
async function rebasedVersion(id: string, entry: Lane, payload: AppPayload): Promise<number | null> {
  const contentOnly = Object.keys(payload).every(key => key === 'content' || key === 'version')
  if (!contentOnly || !entry.base) return null
  try {
    const fresh = await getActivity(id)
    return typeof fresh.version === 'number' && sameContent(fresh.content, entry.base.content) ? fresh.version : null
  } catch {
    return null
  }
}

/** The error a stopped activity's saves reject with (the one that stopped it, if seen here). */
function stoppedError(id: string, entry: Lane | undefined): unknown {
  const current = useCourseEditorStore.getState().activitySave
  if (current.activityUuid !== id) return null
  if (current.status !== 'conflict' && current.status !== 'forbidden') return null
  return (
    entry?.stopped ??
    (current.status === 'forbidden'
      ? new APIError({ status: 403, code: 'forbidden', message: 'Autosave stopped: no access' })
      : new APIError({ status: 412, code: 'precondition-failed', message: 'Autosave stopped: saved elsewhere' }))
  )
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
  const loadedContent = useRef(options.loadedContent)
  useEffect(() => {
    loadedContent.current = options.loadedContent
  }, [options.loadedContent])

  const updateRef = useRef(updateActivity)
  useEffect(() => {
    updateRef.current = updateActivity
  }, [updateActivity])

  // The activity `version` of the last save (UX-027): the loaded one until the
  // first save answers, then whatever the server handed back - per activity.
  // After a 412 (another tab saved first) this activity's autosave stops;
  // the notice offers a reload.
  const lanes = useRef(new Map<string, Lane>())
  const lane = useCallback(
    (id: string) => {
      let found = lanes.current.get(id)
      if (!found) {
        const base =
          id === activityUuid && loadedContent.current !== undefined ? { content: loadedContent.current } : null
        found = { timer: null, next: null, running: false, version: null, base, stopped: null }
        lanes.current.set(id, found)
      }
      return found
    },
    [activityUuid],
  )

  const drain = useCallback(
    async (id: string, entry: Lane) => {
      if (entry.running) return
      entry.running = true
      while (entry.next) {
        const { payload, waiters } = entry.next
        entry.next = null
        const stopped = stoppedError(id, entry)
        if (stopped) {
          for (const waiter of waiters) waiter.reject(stopped)
          continue
        }
        setStatus(id, 'saving')
        let rebased = false
        for (;;) {
          try {
            const saved = await updateRef.current(id, {
              ...payload,
              version: entry.version ?? (typeof payload.version === 'number' ? payload.version : undefined),
            })
            if (typeof saved.version === 'number') entry.version = saved.version
            if ('content' in payload) entry.base = { content: payload.content }
            if (!entry.next && !entry.timer) setStatus(id, 'saved')
            for (const waiter of waiters) waiter.resolve()
            break
          } catch (error: unknown) {
            if (!rebased && hasErrorCode(error, 'precondition-failed')) {
              const version = await rebasedVersion(id, entry, payload)
              if (version !== null) {
                rebased = true
                entry.version = version
                continue
              }
            }
            const status = hasErrorCode(error, 'precondition-failed')
              ? 'conflict'
              : isApiError(error) && error.status === 403
                ? 'forbidden'
                : 'error'
            if (status !== 'error') entry.stopped = error
            setStatus(id, status)
            for (const waiter of waiters) waiter.reject(error)
            break
          }
        }
      }
      entry.running = false
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
      const stopped = stoppedError(activityUuid, lanes.current.get(activityUuid))
      if (stopped) throw stopped
      await enqueue(activityUuid, payload)
    },
    [activityUuid, enqueue],
  )

  return {
    flush,
    onChange,
    lastSavedAt: own ? activitySave.savedAt : null,
    saveStatus: own ? activitySave.status : 'idle',
  }
}
