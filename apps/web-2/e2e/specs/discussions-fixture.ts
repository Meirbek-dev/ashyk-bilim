import { finishPages } from '../fixtures/test'
import { randomUUID } from 'node:crypto'

import { createClient, createConfig } from '#/shared/api/gen/client'
import {
  courseLifecycle,
  createActivity,
  createChapter,
  createCourse,
  createDiscussion,
  deleteCourse,
  enroll,
  updateActivity,
} from '#/shared/api/gen/sdk.gen'
import type { Course, Discussion, DiscussionId } from '#/shared/api/gen/types.gen'

import { test as base } from '../fixtures/seed'
import { cookieOf } from './course-studio-fixture'

type Author = 'teacher' | 'student'

/** A post's stored content: the editor document as a JSON string, the way the composer sends it. */
const doc = (text: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

// Each test gets its own published course of the teacher; posts are made through the SDK as either account.
export const test = base.extend<{
  api: ReturnType<typeof createClient>
  /** A published course of the teacher; the student is enrolled unless `enrolStudent` is false (posting needs it). */
  course: (enrolStudent?: boolean) => Promise<Course>
  post: (course: Course, text: string, author?: Author, parent?: DiscussionId) => Promise<Discussion>
}>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  course: async ({ api, seed, page }, use, info) => {
    const made: string[] = []
    const headers = cookieOf(seed, 'teacher')
    await use(async (enrolStudent = true) => {
      const name = `E2E discussions ${randomUUID().slice(0, 8)}`
      const { data: course } = await createCourse({ client: api, body: { name }, headers, throwOnError: true })
      made.push(course.id)
      const path = { course_id: course.id }
      const chapter = await createChapter({ client: api, path, body: { name: 'Глава' }, headers, throwOnError: true })
      const activity = await createActivity({
        client: api,
        path: { chapter_id: chapter.data.id },
        body: { name: 'Страница', activity_type: 'dynamic', activity_sub_type: 'dynamic_page' },
        headers,
      })
      const id = activity.data?.id ?? ''
      await updateActivity({
        client: api,
        path: { activity_id: id },
        body: { published: true },
        headers,
        throwOnError: true,
      })
      await courseLifecycle({ client: api, path, body: { action: 'publish' }, headers, throwOnError: true })
      if (enrolStudent) await enroll({ client: api, path, headers: cookieOf(seed, 'student'), throwOnError: true })
      return course
    })
    try {
      if (info.status === 'passed') await finishPages(page.context())
    } finally {
      for (const id of made) await deleteCourse({ client: api, path: { course_id: id }, headers })
    }
  },
  post: async ({ api, seed }, use) =>
    use(async (course, text, author = 'student', parent) => {
      const { data } = await createDiscussion({
        client: api,
        path: { course_id: course.id },
        body: { content: doc(text), parent_id: parent },
        headers: cookieOf(seed, author),
        throwOnError: true,
      })
      return data
    }),
})

export const tab = (course: Course, thread?: string) =>
  `/courses/${course.id}/discussions${thread ? `?thread=${thread}` : ''}`

export const article = (page: import('@playwright/test').Page, text: string) =>
  page.locator('article').filter({ hasText: text })
