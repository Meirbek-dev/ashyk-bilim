'use client';

import type { CourseDirtySection } from '@/stores/courses/courseEditorStore';
import { useCourseEditorStore } from '@/stores/courses';
import { useEffect } from 'react';

/**
 * Syncs RHF's `formState.isDirty` (or any boolean dirty flag) into the
 * `courseEditorStore.dirtySections` map.
 *
 * Usage:
 *   useSyncDirtySection('general', form.formState.isDirty)
 */
export function useSyncDirtySection(section: CourseDirtySection, isDirty: boolean) {
  const setSectionDirty = useCourseEditorStore((state) => state.setSectionDirty);

  useEffect(() => {
    setSectionDirty(section, isDirty);
    return () => {
      setSectionDirty(section, false);
    };
  }, [section, isDirty, setSectionDirty]);
}
