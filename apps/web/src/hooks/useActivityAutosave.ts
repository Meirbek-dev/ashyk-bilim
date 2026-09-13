'use client'

import { useActivityMutations } from '@/hooks/mutations/useActivityMutations'
import { useDebouncedCallback } from '@/hooks/useDebounce'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { useCourseEditorStore } from '@/stores/courses'
import { useCallback, useRef } from 'react'

interface ActivityAutosaveOptions {
  activityUuid: string
  courseUuid: string
  delay?: number
}

export function useActivityAutosave(options: ActivityAutosaveOptions) {
  const { updateActivity } = useActivityMutations(options.courseUuid, true)
  const activitySaveStatus = useCourseEditorStore(state => state.activitySaveStatus)
  const lastActivitySavedAt = useCourseEditorStore(state => state.lastActivitySavedAt)
  const setActivitySaveStatus = useCourseEditorStore(state => state.setActivitySaveStatus)

  // The activity `version` of the last save (UX-027): the loaded one until the
  // first save answers, then whatever the server handed back. After a 412
  // (another tab saved first) autosave stops; the notice offers a reload.
  const versionRef = useRef<number | null>(null)

  const persistDraft = useCallback(
    async (payload: AppPayload) => {
      if (useCourseEditorStore.getState().activitySaveStatus === 'conflict') return
      setActivitySaveStatus('saving')
      try {
        const saved = await updateActivity(options.activityUuid, {
          ...payload,
          version: versionRef.current ?? (typeof payload.version === 'number' ? payload.version : undefined),
        })
        versionRef.current = typeof saved.version === 'number' ? saved.version : versionRef.current
        setActivitySaveStatus('saved')
      } catch (error: unknown) {
        setActivitySaveStatus(hasErrorCode(error, 'precondition-failed') ? 'conflict' : 'error')
        throw error
      }
    },
    [options.activityUuid, setActivitySaveStatus, updateActivity],
  )

  const debouncedSave = useDebouncedCallback((payload: AppPayload) => {
    persistDraft(payload).catch(() => undefined)
  }, options.delay ?? 1500)

  const onChange = useCallback(
    (payload: AppPayload) => {
      if (useCourseEditorStore.getState().activitySaveStatus === 'conflict') return
      setActivitySaveStatus('saving')
      debouncedSave(payload)
    },
    [debouncedSave, setActivitySaveStatus],
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
    lastSavedAt: lastActivitySavedAt,
    saveStatus: activitySaveStatus,
  }
}
