'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { IS_DEVELOPMENT } from '@/services/config/env'
import { cleanCourseUuid } from '@/lib/course-management'

export type CourseDirtySection = 'general' | 'access' | 'contributors' | 'certification' | 'content'
/** `conflict`: another editor saved first (412); that activity's autosave is off until the page reloads. */
/** `forbidden` (UX-214): a 403 — the author lost access; autosave stops like a conflict. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'forbidden'

interface ConflictState {
  isOpen: boolean
  message: string
  serverVersion: { update_date?: string | null } | null
  /** Retry the failed save with the fresh lastKnownUpdateDate from the server version. */
  pendingSave: (() => Promise<unknown>) | null
}

interface CourseEditorState {
  activeCourseUuid: string | null
  lastKnownUpdateDate: string | null
  dirtySections: Partial<Record<CourseDirtySection, boolean>>
  conflict: ConflictState
  /** BUG-282: the autosave state of one activity — another activity reads `idle`. */
  activitySave: ActivitySaveState
}

interface ActivitySaveState {
  activityUuid: string | null
  status: SaveStatus
  savedAt: number | null
}

interface CourseEditorActions {
  openEditor: (courseUuid: string, lastKnownUpdateDate?: string | null) => void
  syncLastKnownUpdateDate: (lastKnownUpdateDate?: string | null) => void
  setSectionDirty: (section: CourseDirtySection, dirty: boolean) => void
  clearDirtySections: () => void
  setConflict: (input: {
    serverVersion?: { update_date?: string | null } | null
    message?: string
    pendingSave?: (() => Promise<unknown>) | null
  }) => void
  dismissConflict: () => void
  saveAnyway: () => Promise<void>
  setActivitySaveStatus: (activityUuid: string, status: SaveStatus) => void
}

const createInitialConflictState = (): ConflictState => ({
  isOpen: false,
  message: '',
  serverVersion: null,
  pendingSave: null,
})

const initialState: CourseEditorState = {
  activeCourseUuid: null,
  lastKnownUpdateDate: null,
  dirtySections: {},
  conflict: createInitialConflictState(),
  activitySave: { activityUuid: null, status: 'idle', savedAt: null },
}

export const useCourseEditorStore = create<CourseEditorState & CourseEditorActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      openEditor: (rawCourseUuid, lastKnownUpdateDate) =>
        set(state => {
          // Providers pass both `course_<id>` and the bare v2 id for the same
          // course; compare normalized so a nested provider does not reset the
          // editor state (activity save status) on every structure refetch.
          const courseUuid = cleanCourseUuid(rawCourseUuid)
          if (state.activeCourseUuid === courseUuid) {
            return {
              activeCourseUuid: courseUuid,
              lastKnownUpdateDate: lastKnownUpdateDate ?? state.lastKnownUpdateDate,
            }
          }
          return {
            ...initialState,
            activeCourseUuid: courseUuid,
            lastKnownUpdateDate: lastKnownUpdateDate ?? null,
          }
        }),

      syncLastKnownUpdateDate: lastKnownUpdateDate => set({ lastKnownUpdateDate: lastKnownUpdateDate ?? null }),

      setSectionDirty: (section, dirty) =>
        set(state => ({
          dirtySections: { ...state.dirtySections, [section]: dirty },
        })),

      clearDirtySections: () => set({ dirtySections: {} }),

      setConflict: ({ serverVersion = null, message = '', pendingSave = null }) =>
        set({
          conflict: {
            isOpen: true,
            serverVersion,
            message: message.trim(),
            pendingSave,
          },
        }),

      dismissConflict: () => set({ conflict: createInitialConflictState() }),

      /**
       * "Save anyway" — sync lastKnownUpdateDate from the server version and retry the pending save.
       */
      saveAnyway: async () => {
        const { conflict } = get()
        if (!conflict.isOpen) return

        set(state => ({
          lastKnownUpdateDate: conflict.serverVersion?.update_date ?? state.lastKnownUpdateDate,
          conflict: createInitialConflictState(),
        }))

        if (conflict.pendingSave) {
          await conflict.pendingSave()
        }
      },

      setActivitySaveStatus: (activityUuid, status) =>
        set(state => {
          const previous = state.activitySave.activityUuid === activityUuid ? state.activitySave.savedAt : null
          return { activitySave: { activityUuid, status, savedAt: status === 'saved' ? Date.now() : previous } }
        }),
    }),
    {
      name: 'CourseEditorStore',
      enabled: IS_DEVELOPMENT,
    },
  ),
)

export const selectHasDirtySections = (state: CourseEditorState & CourseEditorActions): boolean =>
  Object.values(state.dirtySections).some(Boolean)
