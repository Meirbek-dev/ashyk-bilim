// Plain isomorphic functions, NOT server actions: the curriculum page calls
// them from client components and `APIError.code` (`activity-not-ready`, …)
// does not survive the Next server-action boundary (GAUNTLET BUG-035).
// Nothing reads the `courses` / `activities` cache tags (no `cacheTag()`
// consumer), so there is nothing to revalidate here.
import { apiJson, apiResult } from '@/lib/api-client'
import { clientApiError } from '@/lib/api/assertSuccess'
import { ifMatchHeaders, parseEntityTagVersion } from '@/lib/api/headers'
import { Activity as ActivitySchema, ActivityDetail } from '@/lib/api/generated/zod'
import type { Activity as WireActivity } from '@/lib/api/generated/zod'
import { stripEntityPrefix, toAppActivity, toWireActivityType } from '@/hooks/courses/courseKeys'
import { getAPIUrl } from '@services/config/config'
import type { Activity } from '@/components/Contexts/CourseContext'

const json = (method: 'POST' | 'PATCH', body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

/**
 * Activities are optimistic-lock writes (UX-027): the server answers with
 * `ETag: "<version>"` — or, on the 201 of `POST chapters/{id}/activities`,
 * only with `version` in the body (BUG-149) — and a `content` PATCH must send
 * it back as `If-Match` (stale → 412 `precondition-failed`). The version
 * rides on the app activity.
 */
async function withVersion<T extends WireActivity>(
  path: string,
  init: Parameters<typeof apiResult>[1],
  parse: (data: unknown) => T,
) {
  const { data, headers } = await apiResult(path, init, parse)
  return { ...toAppActivity(data), version: parseEntityTagVersion(headers) ?? data.version }
}

/** Closed v2 `UpdateActivityRequest` (`additionalProperties: false`), with `TYPE_*` tokens mapped to the wire. */
function toUpdateActivityRequest(data: Record<string, unknown>) {
  const body: Record<string, unknown> = {}
  for (const key of ['name', 'published', 'content', 'details', 'settings'] as const) {
    if (data[key] !== undefined) body[key] = data[key]
  }
  if (typeof data.activity_type === 'string' && typeof data.activity_sub_type === 'string') {
    body.activity_type = toWireActivityType(data.activity_type)
    body.activity_sub_type = toWireActivityType(data.activity_sub_type)
  }
  return body
}

/**
 * `POST chapters/{id}/activities` takes only `{name, activity_type, activity_sub_type}`;
 * any `content` / `details` / `published` in the payload goes in a follow-up PATCH.
 */
export async function createActivity(data: AppPayload, chapter_id: string | number) {
  if (!data || typeof data !== 'object') {
    throw clientApiError('INVALID_CLIENT_REQUEST', 'Activity payload is required', {
      path: 'chapters/{id}/activities',
    })
  }

  const { name, activity_type, activity_sub_type, chapter_id: _chapterId, ...extras } = data
  let created = await withVersion(
    `chapters/${stripEntityPrefix(String(chapter_id))}/activities`,
    json('POST', {
      name,
      activity_type: toWireActivityType(String(activity_type ?? '')),
      activity_sub_type: toWireActivityType(String(activity_sub_type ?? '')),
    }),
    ActivitySchema.parse,
  )

  const patch = toUpdateActivityRequest(extras)
  if (Object.keys(patch).length > 0) {
    created = await withVersion(
      `activities/${created.id}`,
      json('PATCH', patch, ifMatchHeaders(created.version)),
      ActivitySchema.parse,
    )
  }

  return created
}

/** YouTube activity: `video` / `video_youtube` with `content {uri, type}` and player `details`. */
export async function createExternalVideoActivity(
  data: Record<string, unknown>,
  activity: Record<string, unknown>,
  chapter_id: string | number,
) {
  const defaultDetails = {
    startTime: 0,
    endTime: null,
    autoplay: false,
    muted: false,
  }
  const rawDetails =
    data.details && typeof data.details === 'object' && data.details !== null
      ? (data.details as Record<string, unknown>)
      : null
  const videoDetails = rawDetails
    ? {
        startTime: typeof rawDetails.startTime === 'number' ? rawDetails.startTime : defaultDetails.startTime,
        endTime: typeof rawDetails.endTime === 'number' ? rawDetails.endTime : defaultDetails.endTime,
        autoplay: typeof rawDetails.autoplay === 'boolean' ? rawDetails.autoplay : defaultDetails.autoplay,
        muted: typeof rawDetails.muted === 'boolean' ? rawDetails.muted : defaultDetails.muted,
      }
    : defaultDetails

  return createActivity(
    {
      name: activity.name ?? data.name,
      activity_type: 'TYPE_VIDEO',
      activity_sub_type: 'SUBTYPE_VIDEO_YOUTUBE',
      content: { uri: data.uri, type: data.type ?? 'youtube' },
      details: videoDetails,
    } as AppPayload,
    chapter_id,
  )
}

export async function getActivity(activity_uuid: string, _next?: unknown): Promise<Activity> {
  return withVersion(
    `activities/${stripEntityPrefix(activity_uuid)}`,
    { method: 'GET', baseUrl: getAPIUrl(), timeoutMs: 10_000 },
    ActivityDetail.parse,
  )
}

export async function deleteActivity(activity_uuid: string) {
  await apiJson(`activities/${stripEntityPrefix(activity_uuid)}`, { method: 'DELETE' })
}

/** `data.version` (from the loaded activity) travels as `If-Match`; the answer carries the new one. */
export async function updateActivity(data: Record<string, unknown>, activity_uuid: string) {
  const version = typeof data.version === 'number' ? data.version : undefined
  return withVersion(
    `activities/${stripEntityPrefix(activity_uuid)}`,
    json('PATCH', toUpdateActivityRequest(data), ifMatchHeaders(version)),
    ActivitySchema.parse,
  )
}
