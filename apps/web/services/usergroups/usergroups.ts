'use server';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { courseTag, tags } from '@/lib/cacheTags';

export async function getUserGroups() {
  const result = await apiFetch('usergroups');
  return await getResponseMetadata(result);
}

export async function createUserGroup(body: any) {
  const result = await apiFetch('usergroups/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return metadata;
}

export async function linkUserToUserGroup(usergroup_id: number, user_id: number) {
  const result = await apiFetch(`usergroups/${usergroup_id}/add_users?user_ids=${user_id}`, { method: 'POST' });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}

export async function unLinkUserToUserGroup(usergroup_id: number, user_id: number) {
  const result = await apiFetch(`usergroups/${usergroup_id}/remove_users?user_ids=${user_id}`, { method: 'DELETE' });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
    revalidateTag(tags.users, 'max');
  }

  return metadata;
}

export async function updateUserGroup(usergroup_id: number, data: any) {
  const result = await apiFetch(`usergroups/${usergroup_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return metadata;
}

export async function deleteUserGroup(usergroup_id: number) {
  const result = await apiFetch(`usergroups/${usergroup_id}`, { method: 'DELETE' });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return metadata;
}

interface UserGroupCourseInvalidationOptions {
  courseUuid?: string;
}

async function revalidateUserGroupCourseTags(options?: UserGroupCourseInvalidationOptions) {
  const { revalidateTag } = await import('next/cache');
  const tagsToRevalidate = new Set<string>([tags.platform]);

  if (options?.courseUuid) {
    tagsToRevalidate.add(courseTag.detail(options.courseUuid));
    tagsToRevalidate.add(courseTag.access(options.courseUuid));
  }

  tagsToRevalidate.add(tags.courses);

  for (const tag of tagsToRevalidate) {
    revalidateTag(tag, 'max');
  }
}

export async function linkResourcesToUserGroup(
  usergroup_id: number,
  resource_uuids: any,
  options?: UserGroupCourseInvalidationOptions,
) {
  const result = await apiFetch(`usergroups/${usergroup_id}/add_resources?resource_uuids=${resource_uuids}`, {
    method: 'POST',
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    await revalidateUserGroupCourseTags(options);
  }

  return metadata;
}

export async function unLinkResourcesToUserGroup(
  usergroup_id: number,
  resource_uuids: any,
  options?: UserGroupCourseInvalidationOptions,
) {
  const result = await apiFetch(`usergroups/${usergroup_id}/remove_resources?resource_uuids=${resource_uuids}`, {
    method: 'DELETE',
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    await revalidateUserGroupCourseTags(options);
  }

  return metadata;
}
