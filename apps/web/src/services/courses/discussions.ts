'use server'

import { apiFetch, errorHandling } from '@/lib/api-client'
import { tags } from '@/lib/cacheTags'
import { getServerAPIUrl } from '@services/config/config'

export async function getCourseDiscussions(
  course_uuid: string,
  includeReplies = true,
  limit = 50,
  offset = 0,
): Promise<Discussion[]> {
  const normalizedCourseUuid = course_uuid.startsWith('course_') ? course_uuid : `course_${course_uuid}`
  const result = await apiFetch(
    `courses/${normalizedCourseUuid}/discussions?include_replies=${includeReplies}&limit=${limit}&offset=${offset}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      baseUrl: getServerAPIUrl(),
      timeoutMs: 10_000,
    },
  )
  if (!result.ok) return []
  try {
    return (await result.json()) as Discussion[]
  } catch {
    return []
  }
}

/*
 This file includes POST, PUT, DELETE requests for course discussions
*/

export interface DiscussionCreate {
  content: string
  type?: 'post' | 'reply'
  parent_discussion_id?: number
}

export interface DiscussionUpdate {
  content?: string
  status?: 'active' | 'hidden' | 'deleted'
}

export interface Discussion {
  id: number
  discussion_uuid: string
  content: string
  type: 'post' | 'reply'
  status: 'active' | 'hidden' | 'deleted'
  course_id: number
  user_id: number
  parent_discussion_id?: number
  likes_count: number
  dislikes_count: number
  replies_count: number
  creation_date: string
  update_date: string
  user?: {
    id: number
    user_uuid: string
    username: string
    first_name: string
    last_name: string
    email: string
    avatar_image?: string
    bio?: string
    details?: unknown
    profile?: unknown
  }
  replies?: Discussion[]
  is_liked: boolean
  is_disliked: boolean
}

export async function createDiscussion(course_uuid: string, discussion: DiscussionCreate): Promise<Discussion> {
  const result = await apiFetch(`courses/${course_uuid}/discussions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discussion),
  })
  const data = await errorHandling<Discussion>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data
}

export async function updateDiscussion(
  course_uuid: string,
  discussion_uuid: string,
  discussion: DiscussionUpdate,
): Promise<Discussion> {
  const result = await apiFetch(`courses/${course_uuid}/discussions/${discussion_uuid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discussion),
  })
  const data = await errorHandling<Discussion>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data
}

export async function deleteDiscussion(course_uuid: string, discussion_uuid: string): Promise<{ message: string }> {
  const result = await apiFetch(`courses/${course_uuid}/discussions/${discussion_uuid}`, {
    method: 'DELETE',
  })
  const data = await errorHandling<{ message: string }>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data
}

export async function toggleDiscussionLike(
  course_uuid: string,
  discussion_uuid: string,
): Promise<{
  message: string
  is_liked: boolean
  is_disliked: boolean
  likes_count: number
  dislikes_count: number
}> {
  const result = await apiFetch(`courses/${course_uuid}/discussions/${discussion_uuid}/like`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await errorHandling<{
    message: string
    is_liked: boolean
    is_disliked: boolean
    likes_count: number
    dislikes_count: number
  }>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data
}

export async function toggleDiscussionDislike(
  course_uuid: string,
  discussion_uuid: string,
): Promise<{
  message: string
  is_liked: boolean
  is_disliked: boolean
  likes_count: number
  dislikes_count: number
}> {
  const result = await apiFetch(`courses/${course_uuid}/discussions/${discussion_uuid}/dislike`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await errorHandling<{
    message: string
    is_liked: boolean
    is_disliked: boolean
    likes_count: number
    dislikes_count: number
  }>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.courses, 'max')
  }

  return data
}
