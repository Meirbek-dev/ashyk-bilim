// Plain isomorphic module, NOT a server action: the readiness query runs in
// client components, and a 403 (an author removed mid-edit, UX-214) turned
// into a 500 behind the server-action boundary (BUG-035).
import { apiJson } from '@/lib/api-client'
import { CourseReadiness as CourseReadinessSchema } from '@/lib/api/generated/zod'
import type { ReadinessItem } from '@/lib/api/generated/zod'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'

export interface CourseReadinessIssue {
  /** Server code (`no-live-activity`, `assessment-not-ready`, …), localized by the web. */
  code: string
  severity: 'blocker' | 'warning'
  activity_id: string | null
  /** The activity's name when the issue points at one. */
  title: string | null
  /** Where to fix it: the activity studio, or the workspace stage for course-level codes. */
  path: string | null
}

/** Workspace stage that fixes a course-level readiness code. */
const READINESS_STAGE: Record<string, string> = {
  'no-live-activity': 'curriculum',
  'activity-unpublished': 'curriculum',
  'thumbnail-missing': 'details',
  'certificate-not-configured': 'certificate',
}

export interface CourseReadiness {
  ready: boolean
  issues: CourseReadinessIssue[]
}

/** `GET courses/{id}/readiness` (server-side rule set; codes documented on the route). */
export async function getCourseReadiness(courseUuid: string): Promise<CourseReadiness> {
  const id = stripEntityPrefix(courseUuid)
  const readiness = await apiJson(`courses/${id}/readiness`, {}, CourseReadinessSchema.parse)
  const issue =
    (severity: CourseReadinessIssue['severity']) =>
    (item: ReadinessItem): CourseReadinessIssue => ({
      code: item.code,
      severity,
      activity_id: item.activity_id ?? null,
      title: item.title ?? null,
      path: READINESS_STAGE[item.code]
        ? `/dash/courses/${id}/${READINESS_STAGE[item.code]}`
        : item.activity_id
          ? `/dash/courses/${id}/activity/${item.activity_id}/studio`
          : null,
    })
  return {
    ready: readiness.ready,
    issues: [...readiness.blockers.map(issue('blocker')), ...readiness.warnings.map(issue('warning'))],
  }
}
