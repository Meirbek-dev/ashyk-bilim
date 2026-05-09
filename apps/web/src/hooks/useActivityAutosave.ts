'use client';

import { useActivityMutations } from '@/hooks/mutations/useActivityMutations';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { useCourseEditorStore } from '@/stores/courses';
import { useCallback } from 'react';

interface ActivityAutosaveOptions {
  activityUuid: string;
  courseUuid: string;
  delay?: number;
}

export function useActivityAutosave(options: ActivityAutosaveOptions) {
  const { updateActivity } = useActivityMutations(options.courseUuid, true);
  const activitySaveStatus = useCourseEditorStore((state) => state.activitySaveStatus);
  const lastActivitySavedAt = useCourseEditorStore((state) => state.lastActivitySavedAt);
  const setActivitySaveStatus = useCourseEditorStore((state) => state.setActivitySaveStatus);

  const persistDraft = useCallback(
    async (payload: any) => {
      setActivitySaveStatus('saving');
      try {
        await updateActivity(options.activityUuid, payload);
        setActivitySaveStatus('saved');
      } catch (error: any) {
        setActivitySaveStatus('error');
        throw error;
      }
    },
    [options.activityUuid, setActivitySaveStatus, updateActivity],
  );

  const debouncedSave = useDebouncedCallback((payload: any) => {
    void persistDraft(payload);
  }, options.delay ?? 1500);

  const onChange = useCallback(
    (payload: any) => {
      setActivitySaveStatus('saving');
      debouncedSave(payload);
    },
    [debouncedSave, setActivitySaveStatus],
  );

  const flush = useCallback(
    async (payload: any) => {
      await persistDraft(payload);
    },
    [persistDraft],
  );

  return {
    flush,
    onChange,
    lastSavedAt: lastActivitySavedAt,
    saveStatus: activitySaveStatus,
  };
}
