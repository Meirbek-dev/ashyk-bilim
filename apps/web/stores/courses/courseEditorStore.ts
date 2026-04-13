'use client';

import { create } from 'zustand';

export type CourseDirtySection = 'general' | 'access' | 'contributors' | 'certification' | 'content';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ConflictState {
  isOpen: boolean;
  message: string;
  serverVersion: any | null;
  /** Retry the failed save with the fresh lastKnownUpdateDate from the server version. */
  pendingSave: (() => Promise<unknown>) | null;
}

interface CourseEditorState {
  activeCourseUuid: string | null;
  lastKnownUpdateDate: string | null;
  dirtySections: Partial<Record<CourseDirtySection, boolean>>;
  conflict: ConflictState;
  activitySaveStatus: SaveStatus;
  lastActivitySavedAt: number | null;
}

interface CourseEditorActions {
  openEditor: (courseUuid: string, lastKnownUpdateDate?: string | null) => void;
  syncLastKnownUpdateDate: (lastKnownUpdateDate?: string | null) => void;
  setSectionDirty: (section: CourseDirtySection, dirty: boolean) => void;
  clearDirtySections: () => void;
  setConflict: (input: {
    serverVersion?: any | null;
    message?: string;
    pendingSave?: (() => Promise<unknown>) | null;
  }) => void;
  dismissConflict: () => void;
  saveAnyway: () => Promise<void>;
  setActivitySaveStatus: (status: SaveStatus) => void;
}

const createInitialConflictState = (): ConflictState => ({
  isOpen: false,
  message: '',
  serverVersion: null,
  pendingSave: null,
});

const initialState: CourseEditorState = {
  activeCourseUuid: null,
  lastKnownUpdateDate: null,
  dirtySections: {},
  conflict: createInitialConflictState(),
  activitySaveStatus: 'idle',
  lastActivitySavedAt: null,
};

export const useCourseEditorStore = create<CourseEditorState & CourseEditorActions>((set, get) => ({
  ...initialState,

  openEditor: (courseUuid, lastKnownUpdateDate) =>
    set((state) => {
      if (state.activeCourseUuid === courseUuid) {
        return {
          activeCourseUuid: courseUuid,
          lastKnownUpdateDate: lastKnownUpdateDate ?? state.lastKnownUpdateDate,
        };
      }
      return {
        ...initialState,
        activeCourseUuid: courseUuid,
        lastKnownUpdateDate: lastKnownUpdateDate ?? null,
      };
    }),

  syncLastKnownUpdateDate: (lastKnownUpdateDate) => set({ lastKnownUpdateDate: lastKnownUpdateDate ?? null }),

  setSectionDirty: (section, dirty) =>
    set((state) => ({
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
    const { conflict } = get();
    if (!conflict.isOpen) return;

    set((state) => ({
      lastKnownUpdateDate: conflict.serverVersion?.update_date ?? state.lastKnownUpdateDate,
      conflict: createInitialConflictState(),
    }));

    if (conflict.pendingSave) {
      await conflict.pendingSave();
    }
  },

  setActivitySaveStatus: (status) =>
    set({
      activitySaveStatus: status,
      lastActivitySavedAt: status === 'saved' ? Date.now() : get().lastActivitySavedAt,
    }),
}));

export const selectHasDirtySections = (state: CourseEditorState) => Object.values(state.dirtySections).some(Boolean);
