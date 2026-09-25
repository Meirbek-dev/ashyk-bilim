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
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['learner-course'] }),
    // UX-097: the activity page seeds its runtime query from the server prop
    // (`initialData`), so a `router.refresh()` alone never reaches the header chip.
    queryClient.invalidateQueries({ queryKey: ['student-activity'] }),
  ])
  router.refresh()
}

/**
 * The one progress source for the course page: the server's aggregate
 * (`progress` — only what is required of this learner, BUG-318: an
 * assessment they are off the allowlist of does not count) plus the
 * outline's completed ids for the per-activity checkmarks. `activityCount`
 * is every published activity (UX-119: 0 → nothing to open).
 */
export function learnerCourseProgress(state: LearnerCourseState | null | undefined) {
  const activities = state?.outline.flatMap(chapter => chapter.activities) ?? []
  return {
    completedIds: new Set(activities.filter(activity => activity.complete).map(activity => activity.id)),
    completed: state?.progress.completed_required_count ?? 0,
    total: state?.progress.total_required_count ?? 0,
    percent: Math.round(state?.progress.progress_pct ?? 0),
    activityCount: activities.length,
    /**
     * The server's next step, else the first unfinished activity the learner
     * may take (BUG-318: never a `blocked_reason` one, e.g. off the allowlist).
     */
    nextActivityId:
      state?.next_action.activity_id ??
      activities.find(activity => !activity.complete && !activity.blocked_reason)?.id ??
      null,
  }
}
