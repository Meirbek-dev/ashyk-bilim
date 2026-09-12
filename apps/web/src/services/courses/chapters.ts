// Plain isomorphic functions, NOT server actions — problem+json codes must
// reach the client `toastApiError` (GAUNTLET BUG-035). Nothing reads the
// `courses` cache tags (no `cacheTag()` consumer), so nothing is revalidated.
import { apiJson } from '@/lib/api-client'
import { Chapter } from '@/lib/api/generated/zod'
import type { CourseOrderPayload } from '@/schemas/chapterSchemas'
import { stripEntityPrefix, toAppChapter } from '@/hooks/courses/courseKeys'

/*
 This file includes only POST, PATCH, DELETE requests
*/

const json = (method: 'POST' | 'PATCH', body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** `thumbnail_image` is not in the v2 `UpdateChapterRequest` and is dropped. */
export async function updateChapter(chapterUuid: string, data: AppPayload): Promise<AppChapter> {
  const chapter = await apiJson(
    `chapters/${stripEntityPrefix(chapterUuid)}`,
    json('PATCH', {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.description === undefined ? {} : { description: data.description }),
    }),
    Chapter.parse,
  )
  return toAppChapter(chapter)
}

/**
 * Re-applies the whole order through `POST chapters/{id}/move` and
 * `POST activities/{id}/move` (1-based positions; the server clamps and renumbers).
 * ponytail: N+M sequential requests per drag; diff against the previous order if it gets slow.
 */
export async function updateCourseOrderStructure(_course_uuid: string, data: CourseOrderPayload) {
  for (const [chapterIndex, chapter] of data.chapter_order_by_uuids.entries()) {
    const chapterId = stripEntityPrefix(chapter.chapter_uuid)
    await apiJson(`chapters/${chapterId}/move`, json('POST', { position: chapterIndex + 1 }))
    for (const [activityIndex, activityUuid] of chapter.activities_order_by_uuids.entries()) {
      await apiJson(
        `activities/${stripEntityPrefix(activityUuid)}/move`,
        json('POST', { chapter_id: chapterId, position: activityIndex + 1 }),
      )
    }
  }
}

export async function createChapter(data: AppPayload & { course_uuid: string }): Promise<AppChapter> {
  const chapter = await apiJson(
    `courses/${stripEntityPrefix(data.course_uuid)}/chapters`,
    json('POST', { name: data.name, description: data.description ?? null }),
    Chapter.parse,
  )
  return { ...toAppChapter(chapter), activities: [] }
}

export async function deleteChapter(chapterUuid: string) {
  await apiJson(`chapters/${stripEntityPrefix(chapterUuid)}`, { method: 'DELETE' })
}
