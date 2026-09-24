'use client'

import { useActivityMutations } from '@/hooks/mutations/useActivityMutations'
import { useDebouncedCallback } from '@/hooks/useDebounce'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { useCourseEditorStore } from '@/stores/courses'
import type { SaveStatus } from '@/stores/courses/courseEditorStore'
import { useCallback, useRef } from 'react'

interface ActivityAutosaveOptions {
  activityUuid: string
  courseUuid: string
  delay?: number
}

export function useActivityAutosave(options: ActivityAutosaveOptions) {
  const { updateActivity } = useActivityMutations(options.courseUuid, true)
  const { activityUuid } = options
  // BUG-282: the store holds one activity's save state; any other activity
  // (a lesson opened in-app after a 412 elsewhere) starts from `idle`.
  const activitySave = useCourseEditorStore(state => state.activitySave)
  const own = activitySave.activityUuid === activityUuid
  const setStatus = useCourseEditorStore(state => state.setActivitySaveStatus)
  const setActivitySaveStatus = useCallback(
    (status: SaveStatus) => setStatus(activityUuid, status),
    [activityUuid, setStatus],
  )
  const isConflicted = useCallback(() => {
    const current = useCourseEditorStore.getState().activitySave
    return current.activityUuid === activityUuid && current.status === 'conflict'
  }, [activityUuid])

  // The activity `version` of the last save (UX-027): the loaded one until the
  // first save answers, then whatever the server handed back — per activity,
  // so a hook instance reused across lessons never sends another's version.
  // After a 412 (another tab saved first) this activity's autosave stops;
  // the notice offers a reload.
  const versionRef = useRef<{ activityUuid: string; version: number } | null>(null)

  const persistDraft = useCallback(
    async (payload: AppPayload) => {
      if (isConflicted()) return
      setActivitySaveStatus('saving')
      const known = versionRef.current?.activityUuid === activityUuid ? versionRef.current.version : null
      try {
        const saved = await updateActivity(activityUuid, {
          ...payload,
          version: known ?? (typeof payload.version === 'number' ? payload.version : undefined),
        })
        if (typeof saved.version === 'number') versionRef.current = { activityUuid, version: saved.version }
        setActivitySaveStatus('saved')
      } catch (error: unknown) {
        setActivitySaveStatus(hasErrorCode(error, 'precondition-failed') ? 'conflict' : 'error')
        throw error
      }
    },
    [activityUuid, isConflicted, setActivitySaveStatus, updateActivity],
  )

  const debouncedSave = useDebouncedCallback((payload: AppPayload) => {
    persistDraft(payload).catch(() => undefined)
  }, options.delay ?? 1500)

  const onChange = useCallback(
    (payload: AppPayload) => {
      if (isConflicted()) return
      setActivitySaveStatus('saving')
      debouncedSave(payload)
    },
    [debouncedSave, isConflicted, setActivitySaveStatus],
  )

  const flush = useCallback(
    async (payload: AppPayload) => {
      await persistDraft(payload)
    },
    [persistDraft],
  )

  return {
    flush,
    onChange,
    lastSavedAt: own ? activitySave.savedAt : null,
    saveStatus: own ? activitySave.status : 'idle',
  }
}
