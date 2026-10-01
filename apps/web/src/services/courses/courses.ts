'use server'

import { apiJson } from '@/lib/api-client'
import { Course, CoursePage, Curriculum } from '@/lib/api/generated/zod'
import { emptyPage } from '@/lib/api/contract'
import type { Page } from '@/lib/api/contract'
import { stripEntityPrefix, toAppChapter, toAppCourse } from '@/hooks/courses/courseKeys'
import { getAPIUrl } from '@services/config/config'
import { courseTag, tags } from '@/lib/cacheTags'

/*
 Cached GET requests and cache revalidation. Writes live in `course-writes.ts`
 (plain functions, not server actions - BUG-035 / UX-242).
*/

export type NormalizedCourseWithPermissions = AppCourse

const serverGet = () => ({ method: 'GET', baseUrl: getAPIUrl(), timeoutMs: 10_000 })

export async function revalidateCourse(course_uuid?: string) {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')
  revalidateTag(tags.editableCourses, 'max')
  revalidateTag(courseTag.editableList(), 'max')
  revalidateTag(courseTag.publicList(), 'max')
  if (course_uuid) revalidateTag(courseTag.detail(course_uuid), 'max')
}

/**
 * Public catalog page. The v2 listing is keyset (`{items, next_cursor}`) with
 * no total; `page` is emulated by walking `page - 1` cursor hops so the
 * page-numbered callers keep working, and `next_cursor` is the only "is there
 * a next page" signal (UX-133). `sort: 'progress'` puts the caller's
 * in-progress courses first, ordered by the server (UX-274).
 * ponytail: drop `page` once callers pass `next_cursor` back as `cursor`.
 */
export async function getCourses(_next?: unknown, page = 1, limit = 20, sort?: 'progress') {
  let cursor: string | null | undefined
  let result: Page<Course> = emptyPage()
  for (let hop = 1; hop <= page; hop += 1) {
    const params = new URLSearchParams({ limit: String(limit) })
    if (sort) params.set('sort', sort)
    if (cursor) params.set('cursor', cursor)
    result = await apiJson(`courses?${params}`, serverGet(), value => CoursePage.parse(value))
    cursor = result.next_cursor
    if (!cursor && hop < page) {
      result = emptyPage()
      break
    }
  }

  const courses = result.items.map(toAppCourse)
  const next_cursor = result.next_cursor ?? null
  return { courses, next_cursor }
}

/**
 * Course + curriculum in the `AppCourse` shape (`chapters[].activities[]`).
 * Unpublished activities are dropped unless `withUnpublishedActivities` is set.
 */
export async function getCourseMetadata(
  course_uuid: string,
  _next?: unknown,
  withUnpublishedActivities = false,
): Promise<AppCourse> {
  const id = stripEntityPrefix(course_uuid)
  const [course, curriculum] = await Promise.all([
    apiJson(`courses/${id}`, serverGet(), value => Course.parse(value)),
    apiJson(`courses/${id}/curriculum`, serverGet(), value => Curriculum.parse(value)),
  ])
  // Learner shape: only published lessons, and no chapter without one - an
  // empty «Глава 2 - 0 учебных задач» is the author's business (UX-102).
  const chapters = withUnpublishedActivities
    ? curriculum.chapters.map(chapter => toAppChapter(chapter))
    : curriculum.chapters
        .filter(chapter => chapter.activities.some(activity => activity.published))
        .map(chapter =>
          toAppChapter({ ...chapter, activities: chapter.activities.filter(activity => activity.published) }),
        )
  return { ...toAppCourse(course), chapters }
}
