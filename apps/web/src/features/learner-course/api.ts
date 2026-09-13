import { queryOptions, type QueryClient } from '@tanstack/react-query'

import { apiJson } from '@/lib/api-client'
import { LearnerCourseState } from '@/lib/api/generated/zod'

export type { LearnerCourseState }

export const learnerCourseStateQueryOptions = (courseUuid: string, enabled = true) =>
  queryOptions({
    queryKey: ['learner-course', courseUuid, 'state'],
    queryFn: () => apiJson(`courses/${courseUuid}/learner-state`, {}, value => LearnerCourseState.parse(value)),
    enabled: enabled && Boolean(courseUuid),
    // Teachers publish/unpublish while the learner reads: refresh on focus and remount (UX-050).
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  })

/**
 * After a hand-in (quiz submit, file submit, …): the outline sidebar, header
 * badge, footer CTA and course progress read the learner-state projection —
 * the client query here plus the server-rendered activity runtime.
 */
export async function refreshLearnerCourseState(queryClient: QueryClient, router: { refresh: () => void }) {
  await queryClient.invalidateQueries({ queryKey: ['learner-course'] })
  router.refresh()
}

/**
 * The one progress source for the course page: the learner-state outline
 * (published activities only, same data the activity sidebar renders).
 */
export function learnerCourseProgress(state: LearnerCourseState | null | undefined) {
  const activities = state?.outline.flatMap(chapter => chapter.activities) ?? []
  const completedIds = new Set(activities.filter(activity => activity.complete).map(activity => activity.id))
  const total = activities.length
  const completed = completedIds.size
  return {
    completedIds,
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  }
}
