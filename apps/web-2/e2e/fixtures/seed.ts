import { createClient, createConfig } from '#/shared/api/gen/client'
import { getCurriculum, listCollections, listCourses, login } from '#/shared/api/gen/sdk.gen'
import type { SessionInfo } from '#/shared/api/gen/types.gen'

import { test as base } from './test'

// The seeded stand (`ashyq admin seed-e2e`, S-03), read through the generated SDK. Logins and ids are fetched once
// per worker; each test gets the session cookie of the role it acts as.

export type Role = 'guest' | 'student' | 'teacher' | 'admin'
const LOGINS: Record<Exclude<Role, 'guest'>, string> = {
  student: 'e2e-student1',
  teacher: 'e2e-teacher',
  admin: 'e2e-admin',
}

export function e2ePassword(): string {
  const password = process.env['E2E_PASSWORD']
  if (!password) throw new Error('Set E2E_PASSWORD to the password `ashyq admin seed-e2e` used')
  return password
}

type Account = { cookie: { name: string; value: string }; session: SessionInfo }
export type Seed = {
  accounts: Record<Exclude<Role, 'guest'>, Account>
  /** Values for the route params of spec 5.3. */
  params: Record<'courseId' | 'activityId' | 'collectionId' | 'username' | 'certificateId' | 'submissionId', string>
}

async function signIn(baseUrl: string, loginName: string): Promise<Account> {
  const client = createClient(createConfig({ baseUrl }))
  const { data, response } = await login({
    client,
    body: { login: loginName, password: e2ePassword() },
    throwOnError: true,
  })
  const pair = /^([^=;]+)=([^;]*)/.exec(response.headers.get('set-cookie') ?? '')
  if (!pair?.[1] || pair[2] === undefined) throw new Error(`sign-in of ${loginName} set no session cookie`)
  return { cookie: { name: pair[1], value: pair[2] }, session: data }
}

async function loadSeed(baseUrl: string): Promise<Seed> {
  const [student, teacher, admin] = await Promise.all(Object.values(LOGINS).map(name => signIn(baseUrl, name)))
  if (!student || !teacher || !admin) throw new Error('seeded accounts missing')
  const client = createClient(createConfig({ baseUrl }))
  const courses = await listCourses({ client, throwOnError: true })
  const course = courses.data.items.find(item => item.name === 'E2E seed course')
  if (!course) throw new Error('"E2E seed course" is missing: run `ashyq admin seed-e2e`')
  const curriculum = await getCurriculum({
    client,
    path: { id: course.id },
    headers: { cookie: `${teacher.cookie.name}=${teacher.cookie.value}` },
    throwOnError: true,
  })
  const activity = curriculum.data.chapters.flatMap(chapter => chapter.activities)[0]
  if (!activity) throw new Error('the seed course has no activity')
  const collections = await listCollections({ client, throwOnError: true })
  // No seeded certificate or submission yet: the routes are stubs, any well-formed id renders them.
  const placeholder = '00000000-0000-4000-8000-000000000000'
  return {
    accounts: { student, teacher, admin },
    params: {
      courseId: course.id,
      activityId: activity.id,
      collectionId: collections.data.items[0]?.id ?? placeholder,
      username: 'e2e-teacher',
      certificateId: placeholder,
      submissionId: placeholder,
    },
  }
}

// Module state lives once per worker process: the stand is read once per worker, not once per test.
let seedOnce: Promise<Seed> | undefined

export const test = base.extend<{ seed: Seed; signInAs: (role: Role) => Promise<void> }>({
  seed: async ({ baseURL }, use) => use(await (seedOnce ??= loadSeed(String(baseURL)))),
  signInAs: async ({ context, seed, baseURL }, use) => {
    await use(async role => {
      if (role === 'guest') return
      await context.addCookies([{ ...seed.accounts[role].cookie, url: String(baseURL) }])
    })
  },
})

export { expect } from './test'
