'use client'

import { useActivityMutations } from '@/hooks/mutations/useActivityMutations'
import { useDebouncedCallback } from '@/hooks/useDebounce'
import { useCourseEditorStore } from '@/stores/courses'
import { useCallback } from 'react'

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

  const persistDraft = useCallback(
    async (payload: AppPayload) => {
      setActivitySaveStatus('saving')
      try {
        await updateActivity(options.activityUuid, payload)
        setActivitySaveStatus('saved')
      } catch (error: unknown) {
        setActivitySaveStatus('error')
        throw error
      }
    },
    [options.activityUuid, setActivitySaveStatus, updateActivity],
  )

  const debouncedSave = useDebouncedCallback((payload: AppPayload) => {
    void persistDraft(payload)
  }, options.delay ?? 1500)

  const onChange = useCallback(
    (payload: AppPayload) => {
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
