import type { QueryClient } from '@tanstack/react-query'

import {
  gradingSettingsQueryKey,
  indexStatusQueryKey,
  reindexCourseMutation,
  setGradingSettingsMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import type { CourseId, IndexStatus } from '#/shared/api/gen/types.gen'

/** The auto-drafts switch (B-AIG-01). */
export const settingsSwitchOptions = (courseId: CourseId) => ({
  ...setGradingSettingsMutation(),
  meta: { invalidates: [gradingSettingsQueryKey({ path: { course_id: courseId } })] },
})

/** «Переиндексировать» (B-AIG-05): the answer is the emptied index the minute sweep rebuilds. */
export const reindexOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...reindexCourseMutation(),
  onSuccess: (status: IndexStatus) =>
    queryClient.setQueryData(indexStatusQueryKey({ path: { course_id: courseId } }), status),
})
