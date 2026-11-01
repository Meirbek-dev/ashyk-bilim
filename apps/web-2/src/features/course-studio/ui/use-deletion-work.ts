import { useQueries } from '@tanstack/react-query'

import type { Course, CourseDeletionPreview } from '#/shared/api/gen/types.gen'

import { sumDeletionPreviews } from '../model/studio'
import { deletionPreviewOptions } from '../queries'

/**
 * The bulk delete's learner work (B-CST-45): each target's deletion preview, read afresh while the dialog asks
 * (`enabled`), summed. A preview that fails counts as no work: the server still refuses that delete (409).
 */
export function useDeletionWork(
  courses: readonly Course[],
  enabled: boolean,
): { preview: CourseDeletionPreview; loading: boolean } {
  return useQueries({
    queries: courses.map(course => ({ ...deletionPreviewOptions(course.id), staleTime: 0, retry: false, enabled })),
    combine: results => ({
      preview: sumDeletionPreviews(results.map(result => result.data)),
      loading: enabled && results.some(result => result.isPending),
    }),
  })
}
