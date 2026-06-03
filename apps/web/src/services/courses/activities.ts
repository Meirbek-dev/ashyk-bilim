'use server'

import { apiFetch, errorHandling, getResponseMetadata } from '@/lib/api-client'
import type { CustomResponseTyping } from '@/lib/api-client'
import type { components } from '@/lib/api/generated'
import { getAPIUrl } from '@services/config/config'
import { courseTag, tags } from '@/lib/cacheTags'

type ActivityRead = components['schemas']['ActivityRead']
type ActivityReadWithPermissions = components['schemas']['ActivityReadWithPermissions']
type ActivityDetailResponse = components['schemas']['ActivityDetailResponse']

export interface UrlPreviewResponse {
  title?: string | null
  description?: string | null
  og_image?: string | null
  favicon?: string | null
  og_type?: string | null
  og_url?: string | null
}

type ResponseMetadata<T> = Omit<CustomResponseTyping, 'data'> & {
  data: T | null
}

async function getTypedResponseMetadata<T>(response: Response): Promise<ResponseMetadata<T>> {
  return await getResponseMetadata(response)
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
    throw new Error('Activity payload is required')
  }

  if (!data.content) {
    data.content = {}
  }
  data.chapter_id = chapter_id

  const result = await apiFetch('activities/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const metadata = await getTypedResponseMetadata<ActivityRead>(result)

  if (metadata.success) {
    await invalidateActivityCache(options?.courseUuid)
  }

  return metadata
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

  const result = await apiFetch('activities/external_video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const metadata = await getTypedResponseMetadata<ActivityRead>(result)

  if (metadata.success) {
    await invalidateActivityCache(options?.courseUuid)
  }

  return metadata
}

async function fetchActivity(activity_uuid: string): Promise<ActivityReadWithPermissions> {
  const canonicalActivityUuid = activity_uuid.startsWith('activity_') ? activity_uuid : `activity_${activity_uuid}`

  const result = await apiFetch(`activities/${canonicalActivityUuid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })
  return await errorHandling(result)
}

export async function getActivity(activity_uuid: string, _next?: unknown) {
  return fetchActivity(activity_uuid)
}

export async function deleteActivity(activity_uuid: string) {
  const result = await apiFetch(`activities/${activity_uuid}`, {
    method: 'DELETE',
  })
  const metadata = await getTypedResponseMetadata<ActivityDetailResponse>(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.activities, 'max')
    revalidateTag(tags.courses, 'max')
  }

  return metadata
}

export async function updateActivity(data: Record<string, unknown>, activity_uuid: string) {
  const result = await apiFetch(`activities/${activity_uuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const metadata = await getTypedResponseMetadata<ActivityRead>(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.activities, 'max')
  }

  return metadata
}

export async function getUrlPreview(url: string): Promise<UrlPreviewResponse> {
  const result = await apiFetch(`utils/link-preview?url=${url}`)
  return (await result.json()) as UrlPreviewResponse
}
