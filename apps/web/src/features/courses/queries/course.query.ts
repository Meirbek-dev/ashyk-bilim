import { getCourseEditorBundle } from '@services/courses/editor'
import { getCourseMetadata } from '@services/courses/courses'
import { getCourseDiscussions } from '@services/courses/discussions'
import { apiJson, apiResult } from '@/lib/api-client'
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import {
  AssessmentDetail,
  CoursePage,
  CourseUpdate,
  IssuedCertificate,
  Leaderboard,
  Trail,
  VerifiedCertificate,
} from '@/lib/api/generated/zod'
import { unixToIso } from '@/lib/api/contract'
import type { CourseListKeyOptions } from '@/hooks/courses/courseKeys'
import {
  courseEndpoints,
  courseKeys,
  stripEntityPrefix,
  toAppCertification,
  toAppCourse,
  toAppTrail,
} from '@/hooks/courses/courseKeys'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { normalizeLeaderboard } from '@/services/gamification/normalize'

interface CourseListResponse<TCourse> {
  courses: TCourse[]
  next_cursor?: string | null
}

export function courseQueryOptions<TCourse = unknown>(courseUuid: string) {
  return queryOptions({
    queryKey: courseKeys.detail(courseUuid),
    queryFn: () => apiJson<TCourse>(courseEndpoints.detail(courseUuid)),
  })
}

export function courseMetadataQueryOptions<TCourse = unknown>(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.courses.metadata(courseUuid),
    queryFn: () => apiJson<TCourse>(courseEndpoints.detail(courseUuid)),
  })
}

/** Course + curriculum merged into the `AppCourse` shape (see `getCourseMetadata`). */
export function courseStructureQueryOptions<TCourseStructure = unknown>(
  courseUuid: string,
  withUnpublishedActivities = false,
) {
  return queryOptions({
    queryKey: courseKeys.structure(courseUuid, withUnpublishedActivities),
    queryFn: () => getCourseMetadata(courseUuid, undefined, withUnpublishedActivities) as Promise<TCourseStructure>,
    staleTime: 5000,
  })
}

/**
 * The learner course page outline: teachers publish while the learner reads,
 * and the page seeds the query from the server prop, so it refetches on every
 * focus and every 30 s regardless of staleness (UX-104).
 */
export function learnerCourseStructureQueryOptions<TCourseStructure = unknown>(courseUuid: string) {
  return queryOptions({
    ...courseStructureQueryOptions<TCourseStructure>(courseUuid),
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function courseRightsQueryOptions<TRights = unknown>(courseUuid: string) {
  return queryOptions({
    queryKey: courseKeys.rights(courseUuid),
    queryFn: () => apiJson<TRights>(courseEndpoints.rights(courseUuid)),
  })
}

export function courseEditorBundleQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: courseKeys.editorBundle(courseUuid) ?? ['courses', 'editor-bundle', 'missing'],
    queryFn: () => getCourseEditorBundle(courseUuid),
  })
}

async function fetchCoursePage<TCourse>(options: CourseListKeyOptions): Promise<CourseListResponse<TCourse>> {
  const page = await apiJson(courseEndpoints.list(options), {}, CoursePage.parse)
  return { courses: page.items.map(toAppCourse) as TCourse[], next_cursor: page.next_cursor ?? null }
}

export function courseListQueryOptions<TCourse = unknown>(options: CourseListKeyOptions = {}) {
  return queryOptions({
    queryKey: courseKeys.list(options),
    queryFn: () => fetchCoursePage<TCourse>(options),
  })
}

export function courseUpdatesQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.courses.updates(courseUuid),
    queryFn: async () => {
      const updates = await apiJson(`${courseEndpoints.detail(courseUuid)}/updates`, {}, z.array(CourseUpdate).parse)
      return updates.map(update => ({
        ...update,
        courseupdate_uuid: update.id,
        creation_date: unixToIso(update.created_at_unix) ?? '',
      }))
    },
  })
}

export function courseDiscussionsQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.discussions.list(courseUuid, true),
    queryFn: () => getCourseDiscussions(courseUuid, true, 50),
    // UX-062: a thread left open follows the other side's posts and replies —
    // refetch on focus and every 15 s while the tab is visible.
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  })
}

export function trailCurrentQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.trail.current(),
    queryFn: async () => toAppTrail(await apiJson('trail', {}, Trail.parse)),
    // UX-133: a course left in another tab / unpublished by the teacher must
    // drop off `/trail` on focus — same policy as learner-state (UX-050).
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  })
}

export function trailLeaderboardQueryOptions(limit = 10) {
  return queryOptions({
    queryKey: queryKeys.trail.leaderboard(limit),
    queryFn: async () =>
      normalizeLeaderboard(await apiJson(`gamification/leaderboard?limit=${limit}`, {}, Leaderboard.parse)),
  })
}

export function userCertificatesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.certifications.userAll(),
    queryFn: async () =>
      (await apiJson('me/certificates', {}, z.array(IssuedCertificate).parse)).map(toAppCertification),
  })
}

export function userCourseCertificatesQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.certifications.course(courseUuid),
    queryFn: async () => {
      const result = await apiResult(
        `courses/${stripEntityPrefix(courseUuid)}/certificates/me`,
        {},
        z.array(IssuedCertificate).parse,
      )
      return { ...result, data: result.data.map(toAppCertification) }
    },
  })
}

/** Public verification by `verify_code` (`GET certificates/{code}`, no session needed). */
export function certificateDetailQueryOptions(verifyCode: string) {
  return queryOptions({
    queryKey: queryKeys.certifications.detail(verifyCode),
    queryFn: async () => {
      const result = await apiResult(`certificates/${verifyCode}`, {}, VerifiedCertificate.parse)
      return { ...result, data: toAppCertification(result.data) }
    },
  })
}

/** Blocked: no v2 route for `courses/{id}/contributors`. */
export function courseContributorsQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.courses.contributors(courseUuid),
    queryFn: () => apiResult<AppCourseAuthor[]>(courseEndpoints.contributors(courseUuid)),
  })
}

export function activityAssessmentUuidQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.assessments.activityAssessmentId(activityUuid),
    queryFn: async () => {
      try {
        const data = await apiJson(
          `activities/${stripEntityPrefix(activityUuid)}/assessment`,
          {},
          AssessmentDetail.parse,
        )
        return data.id
      } catch {
        return null
      }
    },
  })
}

export function platformCoursesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.platform.courses(),
    queryFn: () => fetchCoursePage<AppCourse>({ limit: 20 }),
  })
}
