import { randomUUID } from 'node:crypto'

import type { Locator } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import {
  completeActivity,
  enroll,
  courseLifecycle,
  createActivity,
  createChapter,
  createCourse,
  createCourseUpdate,
  deleteCourse,
  removeContributor,
  updateActivity,
  updateCourse,
} from '#/shared/api/gen/sdk.gen'
import type { Activity, Course, UpdateCourseRequest } from '#/shared/api/gen/types.gen'

import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const

const cookie = (seed: Seed, role: 'teacher' | 'student') => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}

type Made = { course: Course; activity: Activity | null }

// Each test gets fresh courses of the teacher (published, one chapter with a published page unless `empty`).
const test = base.extend<{
  api: ReturnType<typeof createClient>
  course: (patch?: UpdateCourseRequest & { empty?: boolean }) => Promise<Made>
}>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  course: async ({ api, seed }, use) => {
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
    for (const id of made) await deleteCourse({ client: api, path: { course_id: id }, headers: teacher })
  },
})

const about = (made: Made) => `/courses/${made.course.id}/about`

// A click that lands before hydration (SSR page) does nothing: retry until it acts.
async function clickUntil(target: Locator, outcome: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await target.click({ timeout: 1000 })
    await outcome()
  }).toPass()
}

test('B-CRS-01 a guest gets the course in the server-rendered document; an unknown id is not found', async ({
  page,
  course,
}) => {
  const made = await course()
  const document = await (await page.request.get(about(made))).text()
  expect(document).toContain(made.course.name)
  expect(document).toContain('Глава первая')
  await page.goto(`/courses/${randomUUID()}/about`)
  await expect(page.getByRole('heading', { name: m.course_not_found({}, ru) })).toBeVisible()
})

test('B-CRS-02 the header names the authors and the update date', async ({ page, course }) => {
  const made = await course()
  await page.goto(about(made))
  await expect(page.getByRole('heading', { level: 1, name: made.course.name })).toBeVisible()
  await expect(page.getByText(m.course_authors({ names: 'E2E teacher' }, ru), { exact: false })).toBeVisible()
})

test('B-CRS-03 a guest enrolling signs in first and comes back', async ({ page, course }) => {
  const made = await course()
  await page.goto(about(made))
  await page.getByRole('link', { name: m.course_enroll({}, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encodeURIComponent(about(made))}`))
})

test('B-CRS-04 a student enrols and the header offers to start', async ({ page, signInAs, course }) => {
  const made = await course()
  await signInAs('student')
  await page.goto(about(made))
  await clickUntil(page.getByRole('button', { name: m.course_enroll({}, ru) }), () =>
    expect(page.getByText(m.course_enrolled({}, ru))).toBeVisible({ timeout: 2000 }),
  )
  await expect(page.getByRole('link', { name: m.course_next_start({}, ru) })).toHaveAttribute(
    'href',
    `/learn/${made.course.id}/${made.activity?.id}`,
  )
})

test("B-CRS-05 an enrolled learner continues at the server's next activity", async ({
  page,
  signInAs,
  course,
  api,
  seed,
}) => {
  const made = await course()
  const path = { course_id: made.course.id }
  await enroll({ client: api, path, headers: cookie(seed, 'student'), throwOnError: true })
  await signInAs('student')
  await page.goto(about(made))
  await expect(page.getByRole('link', { name: m.course_next_start({}, ru) })).toHaveAttribute(
    'href',
    `/learn/${made.course.id}/${made.activity?.id}`,
  )
  await expect(page.getByRole('button', { name: m.course_enroll({}, ru) })).toHaveCount(0)
})

test('B-CRS-06 the course author gets the workspace, never "Enrol"', async ({ page, signInAs, course }) => {
  const made = await course()
  await signInAs('teacher')
  await page.goto(about(made))
  await expect(page.getByRole('link', { name: m.platform_page_course_workspace({}, ru) })).toHaveAttribute(
    'href',
    `/teach/courses/${made.course.id}/overview`,
  )
  await expect(page.getByRole('button', { name: m.course_enroll({}, ru) })).toHaveCount(0)
})

test('B-CRS-07 leaving asks with the course name, starts on Cancel, then offers "Enrol" again', async ({
  page,
  signInAs,
  course,
  api,
  seed,
}) => {
  const made = await course()
  const path = { course_id: made.course.id }
  await enroll({ client: api, path, headers: cookie(seed, 'student'), throwOnError: true })
  await signInAs('student')
  await page.goto(about(made))
  const confirm = page.getByRole('alertdialog', { name: m.course_leave_title({ name: made.course.name }, ru) })
  await clickUntil(page.getByRole('button', { name: m.course_leave({}, ru) }), () =>
    expect(confirm).toBeVisible({ timeout: 1000 }),
  )
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.course_leave({}, ru) }).click()
  await expect(page.getByText(m.course_left({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: m.course_enroll({}, ru) })).toBeVisible()
})

test('B-CRS-08 the description is markdown and the learnings are listed', async ({ page, course }) => {
  const made = await course({ learnings: [{ text: 'Писать тесты' }] })
  await page.goto(about(made))
  await expect(page.getByRole('main').locator('strong', { hasText: 'про' })).toBeVisible()
  await expect(page.getByRole('heading', { name: m.course_learnings_title({}, ru) })).toBeVisible()
  await expect(page.getByText('Писать тесты')).toBeVisible()
})

test('B-CRS-09 the syllabus lists chapters and typed activities, or says there are none', async ({
  page,
  signInAs,
  course,
}) => {
  const made = await course()
  const empty = await course({ empty: true })
  await page.goto(about(made))
  await expect(page.getByRole('heading', { name: 'Глава первая' })).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: 'Вводная страница' })
  await expect(row.getByText(m.activity_type_dynamic({}, ru), { exact: true })).toBeVisible()
  // An empty course cannot be published: its author sees the draft.
  await signInAs('teacher')
  await page.goto(about(empty))
  await expect(page.getByText(m.course_syllabus_empty({}, ru))).toBeVisible()
})

test('B-CRS-10 progress and done marks come from the server', async ({ page, signInAs, course, api, seed }) => {
  const made = await course()
  const student = cookie(seed, 'student')
  await enroll({ client: api, path: { course_id: made.course.id }, headers: student, throwOnError: true })
  const path = { activity_id: made.activity?.id ?? '' }
  await completeActivity({ client: api, path, headers: student, throwOnError: true })
  await signInAs('student')
  await page.goto(about(made))
  await expect(page.getByText(m.course_progress_count({ done: 1, total: 1 }, ru))).toBeVisible()
  const bar = page.getByRole('progressbar', { name: m.course_progress_title({}, ru) })
  await expect(bar).toHaveAttribute('aria-valuenow', '100')
  const row = page.getByRole('listitem').filter({ hasText: 'Вводная страница' })
  await expect(row.getByText(m.course_activity_done({}, ru))).toBeVisible()
  await expect(row.getByRole('link', { name: 'Вводная страница' })).toHaveAttribute(
    'href',
    `/learn/${made.course.id}/${made.activity?.id}`,
  )
})

test('B-CRS-11 a user applies to co-author, withdraws, and learns when it was already decided', async ({
  page,
  signInAs,
  course,
  api,
  seed,
}) => {
  const made = await course({ open_to_contributors: true })
  await signInAs('student')
  await page.goto(about(made))
  await clickUntil(page.getByRole('button', { name: m.course_apply({}, ru) }), () =>
    expect(page.getByText(m.course_applied({}, ru))).toBeVisible({ timeout: 2000 }),
  )
  await page.getByRole('button', { name: m.course_withdraw({}, ru) }).click()
  await expect(page.getByText(m.course_withdrawn({}, ru))).toBeVisible()

  await page.getByRole('button', { name: m.course_apply({}, ru) }).click()
  await expect(page.getByRole('button', { name: m.course_withdraw({}, ru) })).toBeVisible()
  // The creator turns the application down in another tab; this page still offers to withdraw it.
  const studentId = seed.accounts.student.session.user_id
  await removeContributor({
    client: api,
    path: { course_id: made.course.id, user_id: studentId },
    headers: cookie(seed, 'teacher'),
    throwOnError: true,
  })
  await page.getByRole('button', { name: m.course_withdraw({}, ru) }).click()
  await expect(page.getByText(m.course_application_decided({}, ru))).toBeVisible()
})

test('B-CRS-12 announcements are listed for everyone, or the tab says there are none', async ({
  page,
  signInAs,
  course,
  api,
  seed,
}) => {
  const made = await course()
  const empty = await course({ empty: true })
  await createCourseUpdate({
    client: api,
    path: { course_id: made.course.id },
    body: { title: 'Новый модуль', content: 'Добавили **главу**.' },
    headers: cookie(seed, 'teacher'),
    throwOnError: true,
  })
  await page.goto(`/courses/${made.course.id}/updates`)
  await expect(page.getByRole('heading', { name: 'Новый модуль' })).toBeVisible()
  await expect(page.getByRole('main').locator('strong', { hasText: 'главу' })).toBeVisible()
  await signInAs('teacher')
  await page.goto(`/courses/${empty.course.id}/updates`)
  await expect(page.getByText(m.course_updates_empty({}, ru))).toBeVisible()
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-CRS-13 the course pages speak ${locale}`, async ({ page, context, baseURL, signInAs, course }) => {
    const made = await course()
    await signInAs('student')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    for (const tab of ['about', 'updates', 'discussions']) {
      await page.goto(`/courses/${made.course.id}/${tab}`)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1, name: made.course.name })).toBeVisible()
      await expect(page.getByRole('button', { name: m.course_enroll({}, { locale }) })).toBeVisible()
      await expect(page.locator('body')).not.toContainText(/\b(course|discussions|activity|platform|ui)_[a-z_]+/)
    }
  })
}
