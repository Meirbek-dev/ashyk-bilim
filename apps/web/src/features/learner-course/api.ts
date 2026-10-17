import { queryOptions, type QueryClient } from '@tanstack/react-query'

import { toAppActivityType } from '@/hooks/courses/courseKeys'
import { apiJson } from '@/lib/api-client'
import { LearnerCourseState } from '@/lib/api/generated/zod'
import { queryKeys } from '@/lib/react-query/queryKeys'

export type { LearnerCourseState }

/** A test that is scheduled to open: listed locked on the course page, not counted, not linked (ROUND3-11). */
export interface ScheduledActivity {
  id: string
  title: string
  activityType: string
  opensAtUnix: number | null
  chapterId: string
  chapterTitle: string
  /** The chapter's position in the server's outline (a chapter may hold nothing but the scheduled test). */
  chapterOrder: number
}

export function scheduledActivities(state: LearnerCourseState): ScheduledActivity[] {
  return state.outline.flatMap((chapter, chapterOrder) =>
    chapter.activities
      .filter(activity => activity.blocked_reason === 'scheduled')
      .map(activity => ({
        id: activity.id,
        title: activity.title,
        activityType: activity.activity_type,
        opensAtUnix: activity.opens_at_unix ?? null,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterOrder,
      })),
  )
}

/**
 * The learner state as this web shows it: the server also lists a scheduled test (`blocked_reason: 'scheduled'`,
 * with its opening time) whose activity is not published yet - this web's sidebar, progress and activity page
 * follow published activities only, so the entry (and a chapter left empty) is dropped from `outline` and kept
 * in `scheduled` for the course page's locked «Откроется …» rows.
 */
export function parseLearnerCourseState(value: unknown): LearnerCourseState & { scheduled?: ScheduledActivity[] } {
  const state = LearnerCourseState.parse(value)
  const scheduled = scheduledActivities(state)
  const outline = state.outline
    .map(chapter => ({
      ...chapter,
      activities: chapter.activities.filter(activity => activity.blocked_reason !== 'scheduled'),
    }))
    .filter(chapter => chapter.activities.length > 0)
    .map((chapter, index) => Object.assign(chapter, { index }))
  return { ...state, outline, scheduled }
}

/** A locked course-page row: `scheduled_opens_at_unix` marks it (no link, not counted). */
export type ScheduledRow = AppActivity & { scheduled_opens_at_unix: number | null }

export const isScheduledRow = (activity: AppActivity): activity is ScheduledRow => 'scheduled_opens_at_unix' in activity

/**
 * The course page's chapters with each scheduled test appended to its chapter as a locked row; a chapter that
 * holds nothing published yet (so the course read left it out) is added at its outline position (ROUND3-11).
 */
export function withScheduledActivities(chapters: AppChapter[], scheduled: ScheduledActivity[]): AppChapter[] {
  if (scheduled.length === 0) return chapters
  const strip = (id: string | undefined) => (id ?? '').replace(/^chapter_/, '')
  const merged = chapters.map(chapter => ({ ...chapter, activities: [...(chapter.activities ?? [])] }))
  for (const entry of scheduled) {
    const row: ScheduledRow = {
      activity_uuid: entry.id,
      name: entry.title,
      activity_type: toAppActivityType(entry.activityType),
      scheduled_opens_at_unix: entry.opensAtUnix,
    }
    let chapter = merged.find(candidate => strip(candidate.chapter_uuid) === entry.chapterId)
    if (!chapter) {
      chapter = { chapter_uuid: entry.chapterId, name: entry.chapterTitle, activities: [] }
      // ponytail: placed at its outline index among the known chapters - exact while the chapters before it all
      // have a published lesson (the usual case); pass the full outline order if that ever matters.
      merged.splice(Math.min(entry.chapterOrder, merged.length), 0, chapter)
    }
    chapter.activities.push(row)
  }
  return merged
}

/** A direct link to a test that is not open yet: its entry in the learner state, else `null`. */
export async function findScheduledActivity(courseUuid: string, activityId: string) {
  const state = await apiJson(`courses/${courseUuid}/learner-state`, {}, value => LearnerCourseState.parse(value))
  return scheduledActivities(state).find(activity => activity.id === activityId) ?? null
}

export const learnerCourseStateQueryOptions = (courseUuid: string, enabled = true) =>
  queryOptions({
    queryKey: queryKeys.learnerCourse.state(courseUuid),
    queryFn: () => apiJson(`courses/${courseUuid}/learner-state`, {}, parseLearnerCourseState),
    enabled: enabled && Boolean(courseUuid),
    // Teachers publish/unpublish while the learner reads: refresh on focus and remount (UX-050).
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  })

/**
 * After a hand-in (quiz submit, file submit, …): the outline sidebar, header
 * badge, footer CTA and course progress read the learner-state projection -
 * the client query here plus the server-rendered activity runtime.
 */
export async function refreshLearnerCourseState(queryClient: QueryClient, router: { refresh: () => void }) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.learnerCourse.all() }),
    // UX-097: the activity page seeds its runtime query from the server prop
    // (`initialData`), so a `router.refresh()` alone never reaches the header chip.
    queryClient.invalidateQueries({ queryKey: queryKeys.studentActivity.all() }),
  ])
  router.refresh()
}

/**
 * The one progress source for the course page: the server's aggregate
 * (`progress` - only what is required of this learner, BUG-318: an
 * assessment they are off the allowlist of does not count) plus the
 * outline's completed ids for the per-activity checkmarks. `activityCount`
 * is every published activity (UX-119: 0 → nothing to open).
 */
export function learnerCourseProgress(state: LearnerCourseState | null | undefined) {
  const activities = state?.outline.flatMap(chapter => chapter.activities) ?? []
  return {
    completedIds: new Set(activities.filter(activity => activity.complete).map(activity => activity.id)),
    /** Not required of this learner (BUG-318) - left out of every client-side tally. */
    optionalIds: new Set(activities.filter(activity => !activity.required).map(activity => activity.id)),
    completed: state?.progress.completed_required_count ?? 0,
    total: state?.progress.total_required_count ?? 0,
    percent: Math.round(state?.progress.progress_pct ?? 0),
    activityCount: activities.length,
    /**
     * The server's next step, else the first unfinished activity the learner
     * may take (BUG-318: never a `blocked_reason` one, e.g. off the allowlist).
     */
    nextActivityId:
      state?.next_action?.activity_id ??
      activities.find(activity => !activity.complete && !activity.blocked_reason)?.id ??
      null,
  }
}
