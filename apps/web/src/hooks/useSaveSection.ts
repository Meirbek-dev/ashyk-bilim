'use client'

import type { CourseDirtySection } from '@/stores/courses/courseEditorStore'
import { useCourse } from '@components/Contexts/CourseContext'
import { useCourseEditorStore } from '@/stores/courses'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/api/assertSuccess'

type SaveResponse = { success?: boolean; status?: number; data?: unknown } | void

interface NormalizedSaveResponse {
  success: boolean
  status?: number | undefined
  data?: { update_date?: string | null; [key: string]: unknown } | null | undefined
}

function normalizeResponse(response: SaveResponse): NormalizedSaveResponse {
  if (response && typeof response === 'object' && 'success' in response) {
    return {
      success: response.success,
      status: response.status,
      data: response.data as NormalizedSaveResponse['data'],
    }
  }
  return { success: true, data: response as NormalizedSaveResponse['data'] }
}

interface SaveSectionOptions {
  onSuccess?: () => void
  onError?: (message: string) => void
  successMessage?: string
  errorMessage?: string
  section?: CourseDirtySection
}

interface SaveInvocationOptions {
  onSuccess?: () => void
  successMessage?: string
  errorMessage?: string
  refresh?: 'meta' | 'editor' | 'none'
}

/**
 * Centralised save handler for course workspace sections.
 *
 * Wraps the common pattern of:
 *  - setting isSaving state
 *  - calling the API
 *  - handling 409 conflict via the course editor store
 *  - showing a toast on success or error
 *  - calling onSuccess (e.g. markClean)
 *  - refreshing cached course queries when the caller is not already using an optimistic mutation flow
 */
export function useSaveSection(options?: SaveSectionOptions) {
  const [isSaving, setIsSaving] = useState(false)
  const { refreshCourseMeta, refreshCourseEditor } = useCourse()
  const setConflict = useCourseEditorStore(state => state.setConflict)
  const syncLastKnownUpdateDate = useCourseEditorStore(state => state.syncLastKnownUpdateDate)

  const runSave = useCallback(
    async (saveFn: () => Promise<SaveResponse>, invocationOptions?: SaveInvocationOptions) => {
      setIsSaving(true)
      try {
        const response = normalizeResponse(await saveFn())

        if (!response.success) {
          if (response.status === 409) {
            setConflict({
              serverVersion: response.data ?? null,
              message: getApiErrorMessage(response.data, ''),
              pendingSave: async () => {
                await runSave(saveFn, invocationOptions)
              },
            })
            return
          }
          const message = getApiErrorMessage(
            response.data,
            invocationOptions?.errorMessage || options?.errorMessage || 'Failed to save. Please try again.',
          )
          options?.onError?.(message)
          toast.error(message)
          return
        }

        const refreshMode = invocationOptions?.refresh || 'meta'
        if (refreshMode === 'editor') {
          await refreshCourseEditor()
        } else if (refreshMode === 'meta') {
          await refreshCourseMeta()
        }

        syncLastKnownUpdateDate(response.data?.update_date)

        const successMessage = invocationOptions?.successMessage || options?.successMessage || 'Изменения сохранены'
        if (successMessage) toast.success(successMessage)

        invocationOptions?.onSuccess?.()
        options?.onSuccess?.()
      } catch (error: unknown) {
        const apiError = error as AppApiError
        if (apiError.status === 409) {
          setConflict({
            serverVersion: (apiError.data as { update_date?: string | null } | null) ?? null,
            message: String(apiError.detail || apiError.message),
            pendingSave: async () => {
              await runSave(saveFn, invocationOptions)
            },
          })
          return
        }
        const message =
          apiError.message ||
          invocationOptions?.errorMessage ||
          options?.errorMessage ||
          'Failed to save. Please try again.'
        options?.onError?.(message)
        toast.error(message)
      } finally {
        setIsSaving(false)
      }
    },

    [options, refreshCourseEditor, refreshCourseMeta, setConflict, syncLastKnownUpdateDate],
  )

  const save = useCallback(
    async (saveFn: () => Promise<SaveResponse>, invocationOptions?: Omit<SaveInvocationOptions, 'refresh'>) => {
      await runSave(saveFn, { ...invocationOptions, refresh: 'meta' })
    },
    [runSave],
  )

  const saveWithEditorRefresh = useCallback(
    async (saveFn: () => Promise<SaveResponse>, invocationOptions?: Omit<SaveInvocationOptions, 'refresh'>) => {
      await runSave(saveFn, { ...invocationOptions, refresh: 'editor' })
    },
    [runSave],
  )

  const saveWithoutRefresh = useCallback(
    async (saveFn: () => Promise<SaveResponse>, invocationOptions?: Omit<SaveInvocationOptions, 'refresh'>) => {
      await runSave(saveFn, { ...invocationOptions, refresh: 'none' })
    },
    [runSave],
  )

  return { isSaving, save, saveWithEditorRefresh, saveWithoutRefresh }
}
