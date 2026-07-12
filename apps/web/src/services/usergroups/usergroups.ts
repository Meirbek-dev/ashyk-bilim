'use server'

import { apiResult } from '@/lib/api-client'
import { courseTag, tags } from '@/lib/cacheTags'

export async function createUserGroup(body: AppPayload) {
  const data = await apiResult('usergroups/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.platform, 'max')

  return data
}

export async function linkUserToUserGroup(usergroup_id: number, user_id: number) {
  const data = await apiResult(`usergroups/${usergroup_id}/add_users?user_ids=${user_id}`, {
    method: 'POST',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.platform, 'max')
  revalidateTag(tags.users, 'max')

  return data
}

export async function unLinkUserToUserGroup(usergroup_id: number, user_id: number) {
  const data = await apiResult(`usergroups/${usergroup_id}/remove_users?user_ids=${user_id}`, {
    method: 'DELETE',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.platform, 'max')
  revalidateTag(tags.users, 'max')

  return data
}

export async function updateUserGroup(usergroup_id: number, data: AppPayload) {
  const response = await apiResult(`usergroups/${usergroup_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.platform, 'max')

  return response
}

export async function deleteUserGroup(usergroup_id: number) {
  const data = await apiResult(`usergroups/${usergroup_id}`, {
    method: 'DELETE',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.platform, 'max')

  return data
}

interface UserGroupCourseInvalidationOptions {
  courseUuid?: string
}

async function revalidateUserGroupCourseTags(options?: UserGroupCourseInvalidationOptions) {
  const { revalidateTag } = await import('next/cache')
  const tagsToRevalidate = new Set<string>([tags.platform])

  if (options?.courseUuid) {
    tagsToRevalidate.add(courseTag.detail(options.courseUuid))
    tagsToRevalidate.add(courseTag.access(options.courseUuid))
  }

  tagsToRevalidate.add(tags.courses)

  for (const tag of tagsToRevalidate) {
    revalidateTag(tag, 'max')
  }
}

export async function linkResourcesToUserGroup(
  usergroup_id: number,
  resource_uuids: string[],
  options?: UserGroupCourseInvalidationOptions,
) {
  const data = await apiResult(`usergroups/${usergroup_id}/add_resources?resource_uuids=${resource_uuids}`, {
    method: 'POST',
  })

  await revalidateUserGroupCourseTags(options)

  return data
}

export async function unLinkResourcesToUserGroup(
  usergroup_id: number,
  resource_uuids: string[],
  options?: UserGroupCourseInvalidationOptions,
) {
  const data = await apiResult(`usergroups/${usergroup_id}/remove_resources?resource_uuids=${resource_uuids}`, {
    method: 'DELETE',
  })

  await revalidateUserGroupCourseTags(options)

  return data
}
