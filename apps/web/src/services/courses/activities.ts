'use server'

import { apiJson } from '@/lib/api-client'
import { clientApiError } from '@/lib/api/assertSuccess'
import type { components } from '@/lib/api/generated'
import { getAPIUrl } from '@services/config/config'
import { courseTag, tags } from '@/lib/cacheTags'
import type { Activity } from '@/components/Contexts/CourseContext'

type ActivityRead = components['schemas']['ActivityRead']
type ActivityDetailResponse = components['schemas']['ActivityDetailResponse']

export interface UrlPreviewResponse {
  title?: string | null
  description?: string | null
  og_image?: string | null
  favicon?: string | null
  og_type?: string | null
  og_url?: string | null
}

interface ActivityInvalidationOptions {
  courseUuid?: string
}

async function invalidateActivityCache(courseUuid?: string) {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.activities, 'max')
  revalidateTag(tags.courses, 'max')
  if (courseUuid) revalidateTag(courseTag.detail(courseUuid), 'max')
}

export async function createActivity(data: AppPayload, chapter_id: number, options?: ActivityInvalidationOptions) {
  if (!data || typeof data !== 'object') {
    throw clientApiError('INVALID_CLIENT_REQUEST', 'Activity payload is required', {
      path: 'activities/',
    })
  }

  if (!data.content) {
    data.content = {}
  }
  data.chapter_id = chapter_id

  const createdActivity = await apiJson<ActivityRead>('activities/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  await invalidateActivityCache(options?.courseUuid)

  return createdActivity
}

export async function createExternalVideoActivity(
  data: Record<string, unknown>,
  activity: Record<string, unknown>,
  chapter_id: number,
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
  const payload = {
    ...data,
    chapter_id,
    ...(activity.id === undefined ? {} : { activity_id: activity.id }),
    details: JSON.stringify(videoDetails),
  }

  const createdActivity = await apiJson<ActivityRead>('activities/external_video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  await invalidateActivityCache(options?.courseUuid)

  return createdActivity
}

async function fetchActivity(activity_uuid: string): Promise<Activity> {
  const canonicalActivityUuid = activity_uuid.startsWith('activity_') ? activity_uuid : `activity_${activity_uuid}`

  return apiJson<Activity>(`activities/${canonicalActivityUuid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })
}

export async function getActivity(activity_uuid: string, _next?: unknown): Promise<Activity> {
  return fetchActivity(activity_uuid)
}

export async function deleteActivity(activity_uuid: string) {
  const activity = await apiJson<ActivityDetailResponse>(`activities/${activity_uuid}`, {
    method: 'DELETE',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.activities, 'max')
  revalidateTag(tags.courses, 'max')

  return activity
}

export async function updateActivity(data: Record<string, unknown>, activity_uuid: string) {
  const activity = await apiJson<ActivityRead>(`activities/${activity_uuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.activities, 'max')

  return activity
}

export async function getUrlPreview(url: string): Promise<UrlPreviewResponse> {
  return apiJson<UrlPreviewResponse>(`utils/link-preview?url=${url}`)
}
