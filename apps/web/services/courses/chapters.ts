'use server';

import { errorHandling } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import type { CourseOrderPayload } from '@/schemas/chapterSchemas';
import { tags, courseTag } from '@/lib/cacheTags';

/*
 This file includes only POST, PATCH, DELETE requests
*/

export async function updateChapter(chapterUuid: string, data: any) {
  const result = await apiFetch(`chapters/${chapterUuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const response = await errorHandling(result);

  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.courses, 'max');

  return response;
}

export async function updateCourseOrderStructure(course_uuid: string, data: CourseOrderPayload) {
  const result = await apiFetch(`chapters/course/${course_uuid}/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const response = await errorHandling(result);

  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.courses, 'max');
  revalidateTag(courseTag.detail(course_uuid), 'max');

  return response;
}

export async function createChapter(data: any) {
  const result = await apiFetch('chapters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const response = await errorHandling(result);

  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.courses, 'max');

  return response;
}

export async function deleteChapter(chapterUuid: string) {
  const result = await apiFetch(`chapters/${chapterUuid}`, { method: 'DELETE' });
  const response = await errorHandling(result);

  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.courses, 'max');

  return response;
}
