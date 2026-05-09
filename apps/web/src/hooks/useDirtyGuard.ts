'use client';

import { selectHasDirtySections, useCourseEditorStore } from '@/stores/courses';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';

interface DirtyGuardOptions {
  message?: string;
  interceptInAppNavigation?: boolean;
}

export function useDirtyGuard(options?: DirtyGuardOptions) {
  const hasDrafts = useCourseEditorStore(selectHasDirtySections);
  const guard = useUnsavedChangesGuard(hasDrafts, {
    interceptInAppNavigation: options?.interceptInAppNavigation ?? true,
    message: options?.message,
  });

  return {
    ...guard,
    hasDrafts,
  };
}
