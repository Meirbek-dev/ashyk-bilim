'use server';

import { errorHandling } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import type { CourseOrderPayload } from '@/schemas/chapterSchemas';

/*
 This file includes only POST, PATCH, DELETE requests
*/

export async function updateChapter(chapterUuid: string, data: any) {
  const result = await apiFetch(`chapters/${chapterUuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return errorHandling(result);
}

export async function updateCourseOrderStructure(course_uuid: string, data: CourseOrderPayload) {
  const result = await apiFetch(`chapters/course/${course_uuid}/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return errorHandling(result);
}

export async function createChapter(data: any) {
  const result = await apiFetch('chapters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return errorHandling(result);
}

export async function deleteChapter(chapterUuid: string) {
  const result = await apiFetch(`chapters/${chapterUuid}`, { method: 'DELETE' });
  return errorHandling(result);
}
