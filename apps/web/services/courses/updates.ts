'use server';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';

export async function createCourseUpdate(body: any) {
  const result = await apiFetch(`courses/${body.course_uuid}/updates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function deleteCourseUpdate(course_uuid: string, update_uuid: number) {
  const result = await apiFetch(`courses/${course_uuid}/update/${update_uuid}`, {
    method: 'DELETE',
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}
