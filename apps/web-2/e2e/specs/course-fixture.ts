// The course page specs' fixture: fresh courses of the teacher and the seeded accounts' cookies.
import { finishPages, withLearnerWork } from '../fixtures/test'
import { randomUUID } from 'node:crypto'
import { createClient, createConfig } from '#/shared/api/gen/client'
import {
  courseLifecycle,
  createActivity,
  createChapter,
  createCourse,
  deleteCourse,
  updateActivity,
  updateCourse,
} from '#/shared/api/gen/sdk.gen'
import type { Activity, Course, UpdateCourseRequest } from '#/shared/api/gen/types.gen'
import { type Seed, test as base } from '../fixtures/seed'

export { expect } from '../fixtures/seed'
export const ru = { locale: 'ru' } as const
export const cookie = (seed: Seed, role: 'teacher' | 'student') => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}
export type Made = { course: Course; activity: Activity | null }
// Each test gets fresh courses of the teacher (published, one chapter with a published page unless `empty`).
export const test = base.extend<{
  api: ReturnType<typeof createClient>
  course: (patch?: UpdateCourseRequest & { empty?: boolean }) => Promise<Made>
}>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  course: async ({ api, seed, page }, use, info) => {
    const made: string[] = []
    const teacher = cookie(seed, 'teacher')
    await use(async ({ empty = false, ...patch } = {}) => {
      const name = `E2E course ${randomUUID().slice(0, 8)}`
      const body = { name, description: 'Курс **про** e2e' }
      const { data: course } = await createCourse({ client: api, body, headers: teacher, throwOnError: true })
      made.push(course.id)
      let activity: Activity | null = null
      if (!empty) {
        const chapter = await createChapter({
          client: api,
          path: { course_id: course.id },
          body: { name: 'Глава первая' },
          headers: teacher,
          throwOnError: true,
        })
        const created = await createActivity({
          client: api,
          path: { chapter_id: chapter.data.id },
          body: { name: 'Вводная страница', activity_type: 'dynamic', activity_sub_type: 'dynamic_page' },
          headers: teacher,
          throwOnError: true,
        })
        const published = await updateActivity({
          client: api,
          path: { activity_id: created.data.id },
          body: { published: true },
          headers: teacher,
          throwOnError: true,
        })
        activity = published.data
        // Publishing needs a published activity (readiness): an empty course stays a draft its author sees.
        await courseLifecycle({
          client: api,
          path: { course_id: course.id },
          body: { action: 'publish' },
          headers: teacher,
          throwOnError: true,
        })
      }
      if (Object.keys(patch).length === 0) return { course, activity }
      const updated = await updateCourse({ client: api, path: { course_id: course.id }, body: patch, headers: teacher })
      return { course: updated.data ?? course, activity }
    })
    try {
      if (info.status === 'passed') await finishPages(page.context())
    } finally {
      for (const id of made)
        await deleteCourse({ client: api, query: withLearnerWork, path: { course_id: id }, headers: teacher })
    }
  },
})
export const about = (made: Made) => `/courses/${made.course.id}/about`
