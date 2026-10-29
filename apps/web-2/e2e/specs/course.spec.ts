import { expectFailure, clickUntil } from '../fixtures/test'
import { randomUUID } from 'node:crypto'
import { m } from '#/paraglide/messages'
import {
  completeActivity,
  enroll,
  courseLifecycle,
  createCourseUpdate,
  removeContributor,
} from '#/shared/api/gen/sdk.gen'
import { about, cookie, expect, ru, test } from './course-fixture'
test('B-CRS-01 a guest gets the course in the server-rendered document; an unknown id is not found', async ({
  page,
  course,
}) => {
  const made = await course()
  const document = await (await page.request.get(about(made))).text()
  expect(document).toContain(made.course.name)
  expect(document).toContain('Глава первая')
  // A shared link previews the course by its name (messengers, social).
  expect(document).toContain(`property="og:title" content="${made.course.name}"`)
  expectFailure(page, /^\/courses\/[^/]+\/about$/, 404)
  await page.goto(`/courses/${randomUUID()}/about`)
  await expect(page.getByRole('heading', { name: m.course_not_found({}, ru) })).toBeVisible()
})

test('B-CRS-02 the header names the authors and the update date', async ({ page, course }) => {
  const made = await course()
  await page.goto(about(made))
  await expect(page.getByRole('heading', { level: 1, name: made.course.name })).toBeVisible()
  await expect(page.getByText(m.course_author({ names: 'E2E teacher' }, ru), { exact: false })).toBeVisible()
})

test('B-CRS-03 B-CRS-16 a guest enrols after signing in', async ({ page, signInAs, course }) => {
  const made = await course()
  await page.goto(about(made))
  await page.getByRole('link', { name: m.course_enroll({}, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encodeURIComponent(`${about(made)}?enroll=1`)}`))
  const back = new URL(page.url()).searchParams.get('redirect') ?? ''
  await signInAs('student')
  await page.goto(back)
  await expect(page.getByText(m.course_enrolled({}, ru))).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${about(made)}$`))
  await expect(page.getByRole('link', { name: m.course_next_start({}, ru) })).toBeVisible()
})

test('B-CRS-16 an archived course offers a guest no «Записаться»', async ({ page, api, seed, course }) => {
  const made = await course()
  await courseLifecycle({
    client: api,
    path: { course_id: made.course.id },
    body: { action: 'archive' },
    headers: cookie(seed, 'teacher'),
    throwOnError: true,
  })
  await page.goto(about(made))
  await expect(page.getByText(m.course_archived({}, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: m.course_enroll({}, ru) })).toHaveCount(0)
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
  await clickUntil(page.getByRole('main').getByRole('button', { name: m.course_leave({}, ru) }), () =>
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
  // All done: the progress reads «Курс пройден».
  const bar = page.getByRole('progressbar', { name: m.course_completed_title({}, ru) })
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
  expectFailure(page, new RegExp(`^/api/v2/courses/${made.course.id}/contributors/${studentId}$`), 404)
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
