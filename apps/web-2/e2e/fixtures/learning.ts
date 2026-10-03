import { randomUUID } from 'node:crypto'

import { createClient, createConfig } from '#/shared/api/gen/client'
import type { Client } from '#/shared/api/gen/client'
import {
  addActivity,
  addCourse,
  courseLifecycle,
  createActivity,
  createCertification,
  createChapter,
  createCourse,
  deleteCourse,
  login,
  logout,
  myCourseCertificates,
  updateActivity,
} from '#/shared/api/gen/sdk.gen'
import type { ActivityId, CourseId } from '#/shared/api/gen/types.gen'

import { randomIp, registerAccount } from './accounts'
import { test as base } from './seed'

// Learner-side data through the generated SDK: a published course of the teacher's (pages only, so a learner can
// finish it by marking them done) and a fresh learner account per test, so progress and certificates start empty.

export type MadeCourse = {
  id: CourseId
  name: string
  activityIds: ActivityId[]
  /** The teacher unpublishes every page: the course stays published, with nothing to study. */
  hideActivities: () => Promise<void>
  archive: () => Promise<void>
}
type CourseOptions = { activities?: number; certificate?: boolean }

export type Learner = {
  displayName: string
  /** The browser of this test acts as the learner. */
  signIn: () => Promise<void>
  /** Starts the course and marks its first `done` pages complete. */
  enroll: (course: MadeCourse, done?: number) => Promise<void>
  /** The certificate a finished course issues on the spot; its public verification code. */
  certificateCode: (course: MadeCourse) => Promise<string>
}

export const test = base.extend<{
  api: Client
  makeCourse: (options?: CourseOptions) => Promise<MadeCourse>
  learner: Learner
}>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  makeCourse: async ({ api, seed }, use) => {
    const { name: cookieName, value } = seed.accounts.teacher.cookie
    const headers = { cookie: `${cookieName}=${value}` }
    const made: CourseId[] = []
    const publish = (id: ActivityId, published: boolean) =>
      updateActivity({ client: api, path: { activity_id: id }, body: { published }, headers, throwOnError: true })
    await use(async ({ activities = 2, certificate = false } = {}) => {
      const name = `E2E course ${randomUUID().slice(0, 8)}`
      const { data: course } = await createCourse({ client: api, body: { name }, headers, throwOnError: true })
      made.push(course.id)
      const { data: chapter } = await createChapter({
        client: api,
        path: { course_id: course.id },
        body: { name: 'Chapter' },
        headers,
        throwOnError: true,
      })
      const activityIds: ActivityId[] = []
      for (let index = 1; index <= activities; index += 1) {
        const { data: activity } = await createActivity({
          client: api,
          path: { chapter_id: chapter.id },
          body: { name: `Page ${index}`, activity_type: 'dynamic', activity_sub_type: 'dynamic_page' },
          headers,
          throwOnError: true,
        })
        await publish(activity.id, true)
        activityIds.push(activity.id)
      }
      if (certificate) {
        await createCertification({
          client: api,
          body: { course_id: course.id, config: {} },
          headers,
          throwOnError: true,
        })
      }
      await courseLifecycle({
        client: api,
        path: { course_id: course.id },
        body: { action: 'publish' },
        headers,
        throwOnError: true,
      })
      return {
        id: course.id,
        name,
        activityIds,
        hideActivities: async () => {
          for (const id of activityIds) await publish(id, false)
        },
        archive: async () => {
          await courseLifecycle({
            client: api,
            path: { course_id: course.id },
            body: { action: 'archive' },
            headers,
            throwOnError: true,
          })
        },
      }
    })
    for (const id of made) await deleteCourse({ client: api, path: { course_id: id }, headers })
  },
  learner: async ({ api, baseURL, context }, use) => {
    const account = await registerAccount(String(baseURL))
    const { data, response } = await login({
      client: api,
      body: { login: account.username, password: account.password },
      // The login limiter counts per client address, like registration (see accounts.ts): parallel specs share one.
      headers: { 'x-real-ip': randomIp() },
      throwOnError: true,
    })
    const pair = /^([^=;]+)=([^;]*)/.exec(response.headers.get('set-cookie') ?? '')
    if (!pair?.[1] || pair[2] === undefined) throw new Error(`sign-in of ${account.username} set no session cookie`)
    const cookie = { name: pair[1], value: pair[2] }
    const headers = { cookie: `${cookie.name}=${cookie.value}` }
    await use({
      displayName: data.user.display_name,
      signIn: () => context.addCookies([{ ...cookie, url: String(baseURL) }]),
      enroll: async (course, done = 0) => {
        await addCourse({ client: api, path: { course_id: course.id }, headers, throwOnError: true })
        for (const id of course.activityIds.slice(0, done)) {
          await addActivity({ client: api, path: { activity_id: id }, headers, throwOnError: true })
        }
      },
      certificateCode: async course => {
        const issued = await myCourseCertificates({
          client: api,
          path: { course_id: course.id },
          headers,
          throwOnError: true,
        })
        const code = issued.data[0]?.certificate.verify_code
        if (!code) throw new Error(`no certificate issued for ${course.name}`)
        return code
      },
    })
    await logout({ client: api, headers })
  },
})

export { expect } from './test'
