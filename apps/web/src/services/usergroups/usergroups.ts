'use server'

import { apiResult } from '@/lib/api-client'
import type { CreateUsergroupRequest, UpdateUsergroupRequest, Usergroup } from '@/lib/api/generated/zod'
import { courseTag, tags } from '@/lib/cacheTags'

const json = (body: unknown) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function revalidate(...tagNames: string[]) {
  const { revalidateTag } = await import('next/cache')
  for (const tag of tagNames) revalidateTag(tag, 'max')
}

export async function createUserGroup(body: CreateUsergroupRequest) {
  const data = await apiResult<Usergroup>('usergroups', { method: 'POST', ...json(body) })
  await revalidate(tags.platform)
  return data
}

export async function linkUserToUserGroup(usergroup_id: string, user_id: string) {
  const data = await apiResult<void>(`usergroups/${usergroup_id}/members`, {
    method: 'POST',
    ...json({ user_ids: [user_id] }),
  })
  await revalidate(tags.platform, tags.users)
  return data
}

export async function unLinkUserToUserGroup(usergroup_id: string, user_id: string) {
  const data = await apiResult<void>(`usergroups/${usergroup_id}/members`, {
    method: 'DELETE',
    ...json({ user_ids: [user_id] }),
  })
  await revalidate(tags.platform, tags.users)
  return data
}

export async function updateUserGroup(usergroup_id: string, data: UpdateUsergroupRequest) {
  const response = await apiResult<Usergroup>(`usergroups/${usergroup_id}`, { method: 'PATCH', ...json(data) })
  await revalidate(tags.platform)
  return response
}

export async function deleteUserGroup(usergroup_id: string) {
  const data = await apiResult<void>(`usergroups/${usergroup_id}`, { method: 'DELETE' })
  await revalidate(tags.platform)
  return data
}

interface UserGroupCourseInvalidationOptions {
  courseUuid?: string
}

async function revalidateUserGroupCourseTags(options?: UserGroupCourseInvalidationOptions) {
  const tagNames: string[] = [tags.platform, tags.courses]
  if (options?.courseUuid) tagNames.push(courseTag.detail(options.courseUuid), courseTag.access(options.courseUuid))
  await revalidate(...tagNames)
}

export async function linkResourcesToUserGroup(
  usergroup_id: string,
  course_ids: string[],
  options?: UserGroupCourseInvalidationOptions,
) {
  const data = await apiResult<void>(`usergroups/${usergroup_id}/courses`, {
    method: 'POST',
    ...json({ course_ids }),
  })
  await revalidateUserGroupCourseTags(options)
  return data
}

export async function unLinkResourcesToUserGroup(
  usergroup_id: string,
  course_ids: string[],
  options?: UserGroupCourseInvalidationOptions,
) {
  const data = await apiResult<void>(`usergroups/${usergroup_id}/courses`, {
    method: 'DELETE',
    ...json({ course_ids }),
  })
  await revalidateUserGroupCourseTags(options)
  return data
}
