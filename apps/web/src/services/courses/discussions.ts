'use server';

import { errorHandling } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';

/*
 This file includes POST, PUT, DELETE requests for course discussions
*/

export interface DiscussionCreate {
  content: string;
  type?: 'post' | 'reply';
  parent_discussion_id?: number;
}

export interface DiscussionUpdate {
  content?: string;
  status?: 'active' | 'hidden' | 'deleted';
}

export interface Discussion {
  id: number;
  discussion_uuid: string;
  content: string;
  type: 'post' | 'reply';
  status: 'active' | 'hidden' | 'deleted';
  course_id: number;
  user_id: number;
  parent_discussion_id?: number;
  likes_count: number;
  dislikes_count: number;
  replies_count: number;
  creation_date: string;
  update_date: string;
  user?: {
    id: number;
    user_uuid: string;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_image?: string;
    bio?: string;
    details?: any;
    profile?: any;
  };
  replies?: Discussion[];
  is_liked: boolean;
  is_disliked: boolean;
}

export async function createDiscussion(course_uuid: string, discussion: DiscussionCreate): Promise<Discussion> {
  const result = await apiFetch(`courses/${course_uuid}/discussions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discussion),
  });
  const data = await errorHandling(result);

  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
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
  });
  const data = await errorHandling(result);

  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

export async function deleteDiscussion(course_uuid: string, discussion_uuid: string): Promise<{ message: string }> {
  const result = await apiFetch(`courses/${course_uuid}/discussions/${discussion_uuid}`, {
    method: 'DELETE',
  });
  const data = await errorHandling(result);

  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

export async function likeDiscussion(course_uuid: string, discussion_uuid: string): Promise<any> {
  const result = await apiFetch(`courses/${course_uuid}/discussions/${discussion_uuid}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await errorHandling(result);

  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

export async function toggleDiscussionLike(
  course_uuid: string,
  discussion_uuid: string,
): Promise<{
  message: string;
  is_liked: boolean;
  is_disliked: boolean;
  likes_count: number;
  dislikes_count: number;
}> {
  const result = await apiFetch(`courses/${course_uuid}/discussions/${discussion_uuid}/like`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await errorHandling(result);

  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}

export async function toggleDiscussionDislike(
  course_uuid: string,
  discussion_uuid: string,
): Promise<{
  message: string;
  is_liked: boolean;
  is_disliked: boolean;
  likes_count: number;
  dislikes_count: number;
}> {
  const result = await apiFetch(`courses/${course_uuid}/discussions/${discussion_uuid}/dislike`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await errorHandling(result);

  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return data;
}
