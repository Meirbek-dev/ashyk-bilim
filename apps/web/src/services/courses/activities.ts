'use server'

import { apiJson } from '@/lib/api-client'
import { clientApiError } from '@/lib/api/assertSuccess'
import { Activity as ActivitySchema, ActivityDetail } from '@/lib/api/generated/zod'
import { stripEntityPrefix, toAppActivity, toWireActivityType } from '@/hooks/courses/courseKeys'
import { getAPIUrl } from '@services/config/config'
import { courseTag, tags } from '@/lib/cacheTags'
import type { Activity } from '@/components/Contexts/CourseContext'

interface ActivityInvalidationOptions {
  courseUuid?: string
}

const json = (method: 'POST' | 'PATCH', body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

async function invalidateActivityCache(courseUuid?: string) {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.activities, 'max')
  revalidateTag(tags.courses, 'max')
  if (courseUuid) revalidateTag(courseTag.detail(stripEntityPrefix(courseUuid)), 'max')
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
export async function createActivity(
  data: AppPayload,
  chapter_id: string | number,
  options?: ActivityInvalidationOptions,
) {
  if (!data || typeof data !== 'object') {
    throw clientApiError('INVALID_CLIENT_REQUEST', 'Activity payload is required', {
      path: 'chapters/{id}/activities',
    })
  }

  const { name, activity_type, activity_sub_type, chapter_id: _chapterId, ...extras } = data
  let created = await apiJson(
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
    created = await apiJson(`activities/${created.id}`, json('PATCH', patch), ActivitySchema.parse)
  }

  await invalidateActivityCache(options?.courseUuid)

  return toAppActivity(created)
}

/** YouTube activity: `video` / `video_youtube` with `content {uri, type}` and player `details`. */
export async function createExternalVideoActivity(
  data: Record<string, unknown>,
  activity: Record<string, unknown>,
  chapter_id: string | number,
  options?: ActivityInvalidationOptions,
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
    options,
  )
}

export async function getActivity(activity_uuid: string, _next?: unknown): Promise<Activity> {
  const detail = await apiJson(
    `activities/${stripEntityPrefix(activity_uuid)}`,
    { method: 'GET', baseUrl: getAPIUrl(), timeoutMs: 10_000 },
    ActivityDetail.parse,
  )
  return toAppActivity(detail)
}

export async function deleteActivity(activity_uuid: string) {
  await apiJson(`activities/${stripEntityPrefix(activity_uuid)}`, { method: 'DELETE' })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.activities, 'max')
  revalidateTag(tags.courses, 'max')
}

export async function updateActivity(data: Record<string, unknown>, activity_uuid: string) {
  const activity = await apiJson(
    `activities/${stripEntityPrefix(activity_uuid)}`,
    json('PATCH', toUpdateActivityRequest(data)),
    ActivitySchema.parse,
  )

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.activities, 'max')

  return toAppActivity(activity)
}
