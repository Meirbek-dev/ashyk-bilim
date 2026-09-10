import { getCourseEditorBundle } from '@services/courses/editor'
import { getCourseMetadata } from '@services/courses/courses'
import { apiJson, apiResult } from '@/lib/api-client'
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import {
  AssessmentDetail,
  CoursePage,
  CourseUpdate,
  IssuedCertificate,
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
import type { PlatformLeaderboard } from '@/types/gamification'

interface CourseListResponse<TCourse> {
  courses: TCourse[]
  /** Keyset listings have no total; only the (blocked) editable list still reports one. */
  total?: number
  next_cursor?: string | null
  summary?: {
    total: number
    ready: number
    private: number
    attention: number
  }
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
    queryFn: () =>
      getCourseMetadata(courseUuid, undefined, withUnpublishedActivities) as Promise<TCourseStructure>,
    staleTime: 5000,
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

/** Blocked: no v2 route for `courses/editable`. */
export function editableCourseListQueryOptions<TCourse = unknown>(options: CourseListKeyOptions = {}) {
  return queryOptions({
    queryKey: courseKeys.editable(options),
    queryFn: async (): Promise<CourseListResponse<TCourse>> => {
      const response = await apiResult(courseEndpoints.editable(options))
      const courses = Array.isArray(response.data) ? (response.data as TCourse[]) : []
      return {
        courses,
        total: Number.parseInt(response.headers['x-total-count'] ?? '0', 10),
        summary: {
          total: Number.parseInt(response.headers['x-summary-total'] ?? response.headers['x-total-count'] ?? '0', 10),
          ready: Number.parseInt(response.headers['x-summary-ready'] ?? '0', 10),
          private: Number.parseInt(response.headers['x-summary-private'] ?? '0', 10),
          attention: Number.parseInt(response.headers['x-summary-attention'] ?? '0', 10),
        },
      }
    },
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

export function courseDiscussionsQueryOptions(
  courseUuid: string,
  options: { includeReplies?: boolean; limit?: number; offset?: number } = {},
) {
  const { includeReplies = false, limit = 50, offset = 0 } = options

  return queryOptions({
    queryKey: queryKeys.discussions.list(courseUuid, includeReplies, limit, offset),
    queryFn: () => {
      const queryString = new URLSearchParams({
        include_replies: String(includeReplies),
        limit: String(limit),
        offset: String(offset),
      }).toString()

      return apiJson<unknown[]>(`${courseEndpoints.detail(courseUuid)}/discussions?${queryString}`)
    },
  })
}

export function trailCurrentQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.trail.current(),
    queryFn: async () => toAppTrail(await apiJson('trail', {}, Trail.parse)),
  })
}

export function trailLeaderboardQueryOptions(limit = 10) {
  return queryOptions({
    queryKey: queryKeys.trail.leaderboard(limit),
    queryFn: () => apiJson<PlatformLeaderboard>(`gamification/leaderboard?limit=${limit}`),
  })
}

export function userCertificatesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.certifications.userAll(),
    queryFn: async () => (await apiJson('me/certificates', {}, z.array(IssuedCertificate).parse)).map(toAppCertification),
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
    queryKey: queryKeys.assessments.activity(activityUuid),
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
