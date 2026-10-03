import { randomUUID } from 'node:crypto'

import { createClient, createConfig } from '#/shared/api/gen/client'
import type { Client } from '#/shared/api/gen/client'
import {
  courseLifecycle,
  createActivity,
  createChapter,
  createCourse,
  deleteCourse,
  updateActivity,
} from '#/shared/api/gen/sdk.gen'
import type { Activity, Chapter, Course } from '#/shared/api/gen/types.gen'

import { expect as baseExpect, type Seed, test as base } from '../fixtures/seed'

// Data of the course-studio specs, made through the generated SDK: each test gets fresh courses of the teacher
// (or the admin), deleted afterwards. Shared by the course-studio*.spec.ts files.

export const ru = { locale: 'ru' } as const

export const cookieOf = (seed: Seed, role: 'teacher' | 'student' | 'admin') => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}

type ChapterSpec = { name?: string; pages?: { name?: string; published?: boolean }[] }
type CourseSpec = { chapters?: ChapterSpec[]; publish?: boolean; owner?: 'teacher' | 'admin' }
type MadeCourse = { course: Course; chapters: { chapter: Chapter; activities: Activity[] }[] }

export type Studio = {
  api: Client
  course: (spec?: CourseSpec) => Promise<MadeCourse>
  /** A course the UI created: deleted with the others. */
  track: (courseId: string) => void
}

export const test = base.extend<{ studio: Studio }>({
  studio: async ({ baseURL, seed }, use) => {
    const api = createClient(createConfig({ baseUrl: String(baseURL) }))
    const made: { id: string; headers: { cookie: string } }[] = []
    const course = async ({ chapters = [], publish = false, owner = 'teacher' }: CourseSpec = {}) => {
      const headers = cookieOf(seed, owner)
      const name = `E2E studio ${randomUUID().slice(0, 8)}`
      const { data } = await createCourse({ client: api, body: { name }, headers, throwOnError: true })
      made.push({ id: data.id, headers })
      const built: MadeCourse['chapters'] = []
      for (const [at, spec] of chapters.entries()) {
        const chapter = await createChapter({
          client: api,
          path: { id: data.id },
          body: { name: spec.name ?? `Глава ${at + 1}` },
          headers,
          throwOnError: true,
        })
        const activities: Activity[] = []
        for (const [index, page] of (spec.pages ?? []).entries()) {
          const created = await createActivity({
            client: api,
            path: { id: chapter.data.id },
            body: {
              name: page.name ?? `Страница ${at + 1}.${index + 1}`,
              activity_type: 'dynamic',
              activity_sub_type: 'dynamic_page',
            },
            headers,
            throwOnError: true,
          })
          if (!page.published) activities.push(created.data)
          else {
            const body = { published: true }
            const published = await updateActivity({ client: api, path: { id: created.data.id }, body, headers })
            activities.push(published.data ?? created.data)
          }
        }
        built.push({ chapter: chapter.data, activities })
      }
      if (publish) {
        const body = { action: 'publish' }
        await courseLifecycle({ client: api, path: { id: data.id }, body, headers, throwOnError: true })
      }
      return { course: data, chapters: built }
    }
    await use({ api, course, track: id => made.push({ id, headers: cookieOf(seed, 'teacher') }) })
    for (const { id, headers } of made) await deleteCourse({ client: api, path: { id }, headers })
  },
})

// Under `vp dev` a fresh context loads the studio's editor and drag-and-drop modules unbundled: the first render after
// a navigation can take longer than the default 5 s on a loaded machine.
export const expect = baseExpect.configure({ timeout: 15_000 })
