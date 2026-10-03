import { createClient, createConfig } from '#/shared/api/gen/client'
import type { Client } from '#/shared/api/gen/client'
import {
  createCollection,
  createUsergroup,
  getCollection,
  getCurriculum,
  learnerCourseState,
  listCourses,
  listUsergroups,
  login,
  search,
} from '#/shared/api/gen/sdk.gen'
import type { CollectionAction, CourseId, SessionInfo } from '#/shared/api/gen/types.gen'

import { randomIp } from './accounts'
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
type SignedIn = Exclude<Role, 'guest'>
export type Seed = {
  accounts: Record<SignedIn, Account>
  /** `allowed_actions` of the seed collection per role: routes guarded by an object's actions (spec 7.5). */
  collectionActions: Record<SignedIn, CollectionAction[]>
  /** Whether the role is enrolled in the seed course: the player routes (/learn/...) open only to the enrolled. */
  enrolled: Record<SignedIn, boolean>
  /** Values for the route params of spec 5.3. */
  params: Record<
    'courseId' | 'activityId' | 'collectionId' | 'username' | 'certificateId' | 'submissionId' | 'roleSlug' | 'groupId',
    string
  >
}

async function signIn(baseUrl: string, loginName: string): Promise<Account> {
  const client = createClient(createConfig({ baseUrl }))
  const { data, response } = await login({
    client,
    body: { login: loginName, password: e2ePassword() },
    // The login limiter counts per client address (20 per 5 min): each worker's sign-ins get their own.
    headers: { 'x-real-ip': randomIp() },
    throwOnError: true,
  })
  const pair = /^([^=;]+)=([^;]*)/.exec(response.headers.get('set-cookie') ?? '')
  if (!pair?.[1] || pair[2] === undefined) throw new Error(`sign-in of ${loginName} set no session cookie`)
  return { cookie: { name: pair[1], value: pair[2] }, session: data }
}

const cookieOf = (account: Account) => ({ cookie: `${account.cookie.name}=${account.cookie.value}` })

// A collection every spec can read and none deletes: the teacher's, public, holding the seed course (an empty one is
// listed only to its author, UX-127). Found by name, created once per stand.
const SEED_COLLECTION = 'E2E seed collection'
async function seedCollection(client: Client, teacher: Account, courseId: CourseId): Promise<string> {
  const found = await search({ client, query: { q: SEED_COLLECTION }, throwOnError: true })
  const existing = found.data.collections.find(hit => hit.name === SEED_COLLECTION)
  if (existing) return existing.id
  const created = await createCollection({
    client,
    body: { name: SEED_COLLECTION, public: true, courses: [courseId] },
    headers: cookieOf(teacher),
    throwOnError: true,
  })
  return created.data.id
}

// A group the role matrix can open (/teach/groups/$groupId): the teacher's, found by name, created once per stand.
const SEED_GROUP = 'E2E seed group'
async function seedGroup(client: Client, teacher: Account): Promise<string> {
  const groups = await listUsergroups({ client, query: { limit: 100 }, headers: cookieOf(teacher), throwOnError: true })
  const existing = groups.data.items.find(group => group.name === SEED_GROUP)
  if (existing) return existing.id
  const created = await createUsergroup({
    client,
    body: { name: SEED_GROUP },
    headers: cookieOf(teacher),
    throwOnError: true,
  })
  return created.data.id
}

async function loadSeed(baseUrl: string): Promise<Seed> {
  const [student, teacher, admin] = await Promise.all(Object.values(LOGINS).map(name => signIn(baseUrl, name)))
  if (!student || !teacher || !admin) throw new Error('seeded accounts missing')
  const client = createClient(createConfig({ baseUrl }))
  // By name: made courses of parallel specs push the seed course off the first page.
  const courses = await listCourses({ client, query: { q: 'E2E seed course' }, throwOnError: true })
  const course = courses.data.items.find(item => item.name === 'E2E seed course')
  if (!course) throw new Error('"E2E seed course" is missing: run `ashyq admin seed-e2e`')
  const curriculum = await getCurriculum({
    client,
    path: { course_id: course.id },
    headers: cookieOf(teacher),
    throwOnError: true,
  })
  const activity = curriculum.data.chapters.flatMap(chapter => chapter.activities)[0]
  if (!activity) throw new Error('the seed course has no activity')
  const collectionId = await seedCollection(client, teacher, course.id)
  const actionsOf = async (account: Account) =>
    (
      await getCollection({
        client,
        path: { collection_id: collectionId },
        headers: cookieOf(account),
        throwOnError: true,
      })
    ).data.allowed_actions
  const enrolledOf = async (account: Account) =>
    (
      await learnerCourseState({
        client,
        path: { course_id: course.id },
        headers: cookieOf(account),
        throwOnError: true,
      })
    ).data.enrolled
  // No seeded certificate or submission yet: the routes are stubs, any well-formed id renders them.
  const placeholder = '00000000-0000-4000-8000-000000000000'
  return {
    accounts: { student, teacher, admin },
    collectionActions: {
      student: await actionsOf(student),
      teacher: await actionsOf(teacher),
      admin: await actionsOf(admin),
    },
    enrolled: {
      student: await enrolledOf(student),
      teacher: await enrolledOf(teacher),
      admin: await enrolledOf(admin),
    },
    params: {
      courseId: course.id,
      activityId: activity.id,
      collectionId,
      username: 'e2e-teacher',
      certificateId: placeholder,
      submissionId: placeholder,
      // A seeded system role (migration 20260816000003) and the seed group.
      roleSlug: 'instructor',
      groupId: await seedGroup(client, teacher),
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
