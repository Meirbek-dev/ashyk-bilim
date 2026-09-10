'use server'

import { apiJson } from '@/lib/api-client'
import { Discussion as WireDiscussion, DiscussionPage, ReactionState } from '@/lib/api/generated/zod'
import type { Discussion as WireDiscussionType } from '@/lib/api/generated/zod'
import { collectPages } from '@/lib/api/contract'
import { tags } from '@/lib/cacheTags'

export interface Discussion extends Omit<WireDiscussionType, 'replies'> {
  discussion_uuid: string
  type: 'post' | 'reply'
  creation_date: string
  update_date: string
  user?: { id: string; user_uuid: string; username: string; first_name: string; last_name: string; email: string; avatar_image?: string }
  replies: Discussion[]
}

function normalize(value: WireDiscussionType): Discussion {
  return {
    ...value,
    discussion_uuid: value.id,
    type: value.parent_id ? 'reply' : 'post',
    creation_date: new Date(value.created_at_unix * 1000).toISOString(),
    update_date: new Date(value.updated_at_unix * 1000).toISOString(),
    ...(value.author ? { user: { id: value.author.id, user_uuid: value.author.id, username: value.author.username, first_name: value.author.display_name, last_name: '', email: '', avatar_image: value.author.avatar_key ?? '' } } : {}),
    replies: value.replies.map(reply => normalize({ ...reply, replies: [] })),
  }
}

async function invalidate() {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
}

export async function getCourseDiscussions(courseId: string, includeReplies = true, limit = 50): Promise<Discussion[]> {
  const items = await collectPages(cursor => apiJson(`courses/${courseId}/discussions?include_replies=${includeReplies}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {}, data => DiscussionPage.parse(data)))
  return items.map(normalize)
}

export interface DiscussionCreate { content: string; type?: 'post' | 'reply'; parent_discussion_id?: string }
export interface DiscussionUpdate { content?: string; status?: 'active' | 'hidden' | 'deleted' }

export async function createDiscussion(courseId: string, discussion: DiscussionCreate): Promise<Discussion> {
  const data = await apiJson(`courses/${courseId}/discussions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: discussion.content, parent_id: discussion.parent_discussion_id ?? null }) }, data => WireDiscussion.parse(data))
  await invalidate()
  return normalize(data)
}

export async function updateDiscussion(_courseId: string, id: string, discussion: DiscussionUpdate): Promise<Discussion> {
  const data = await apiJson(`discussions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(discussion) }, data => WireDiscussion.parse(data))
  await invalidate()
  return normalize(data)
}

export async function deleteDiscussion(_courseId: string, id: string): Promise<void> {
  await apiJson(`discussions/${id}`, { method: 'DELETE' })
  await invalidate()
}

export async function toggleDiscussionLike(_courseId: string, id: string) {
  const data = await apiJson(`discussions/${id}/like`, { method: 'PUT' }, data => ReactionState.parse(data))
  await invalidate()
  return data
}

export async function toggleDiscussionDislike(_courseId: string, id: string) {
  const data = await apiJson(`discussions/${id}/dislike`, { method: 'PUT' }, data => ReactionState.parse(data))
  await invalidate()
  return data
}
