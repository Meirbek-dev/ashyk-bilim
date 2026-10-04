import { randomUUID } from 'node:crypto'

import type { BrowserContext, Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import type { Client } from '#/shared/api/gen/client'
import {
  adminAward,
  createCourseUpdate,
  currentSession,
  getNotificationPreferences,
  updatePreferences,
} from '#/shared/api/gen/sdk.gen'

import { expectReread } from '../fixtures/test'
import type { MadeCourse } from '../fixtures/learning'
import { expect, ru, test } from './file-submissions-fixture'

// Notifications (slice 3.8): the bell, /notifications, the per-type switches and the live stream. Each test has a
// fresh learner (exact counts); the teacher acts through the SDK while the learner's page stays open.

const bell = (page: Page, count = 0) =>
  page.getByRole('button', {
    name: count > 0 ? m.notifications_bell_unread({ count }, ru) : m.notifications_title({}, ru),
    exact: true,
  })
const updateLink = (page: Page, title: string, course: MadeCourse) =>
  page.getByRole('link', { name: m.notifications_text_update({ title, course: course.name }, ru) })

const test2 = test.extend<{ announce: (course: MadeCourse, title?: string) => Promise<string> }>({
  announce: async ({ api, tasks }, use) => {
    await use(async (course, title = `Новость ${randomUUID().slice(0, 8)}`) => {
      await createCourseUpdate({
        client: api,
        path: { course_id: course.id },
        body: { title, content: 'Текст объявления.' },
        headers: tasks.teacher,
        throwOnError: true,
      })
      return title
    })
  },
})

async function userIdOf(context: BrowserContext, api: Client) {
  const session = (await context.cookies()).find(cookie => cookie.name === 'ab_session')
  const headers = { cookie: `ab_session=${session?.value ?? ''}` }
  const { data } = await currentSession({ client: api, headers, throwOnError: true })
  return { id: data.user.id, headers }
}

test2(
  'B-NOT-07 B-NOT-01 B-NOT-04 B-NOT-05 a course update reaches the open page with the count, and its link reads it',
  async ({ page, learner, makeCourse, announce }) => {
    const course = await makeCourse({ activities: 1 })
    await learner.enroll(course)
    await learner.signIn()
    await page.goto('/notifications')
    await expect(page.getByText(m.notifications_empty({}, ru))).toBeVisible()
    await expect(bell(page)).toBeVisible()

    const title = await announce(course)
    await expect(updateLink(page, title, course)).toBeVisible()
    await expect(bell(page, 1)).toBeVisible()
    const item = page.getByRole('listitem').filter({ has: updateLink(page, title, course) })
    await expect(item.getByText(m.notifications_type_course_update({}, ru))).toBeVisible()
    await expect(item.getByText(m.notifications_new({}, ru))).toBeVisible()

    await updateLink(page, title, course).click()
    await expect(page).toHaveURL(`/courses/${course.id}/updates`)
    await expect(bell(page)).toBeVisible()
  },
)

test2(
  'B-NOT-07 B-NOT-05 a published grade arrives while the learner reads, and leads to the hand-in',
  async ({ page, context, learner, makeCourse, tasks }) => {
    const course = await makeCourse({ activities: 1 })
    const task = await tasks.make(course)
    await learner.enroll(course)
    await learner.signIn()
    const headers = await tasks.headersOf(context)
    const attempt = await tasks.handIn(task, headers, [await tasks.upload(headers)])
    await page.goto('/notifications')
    await expect(bell(page)).toBeVisible()

    await tasks.grade(attempt, { action: 'publish', final_score: 85 })
    const link = page.getByRole('link', {
      name: m.notifications_text_activity({ activity: 'Эссе', course: course.name }, ru),
    })
    await expect(link).toBeVisible()
    await expect(page.getByText(m.notifications_type_grade_published({}, ru))).toBeVisible()
    await expect(page.getByText(m.notifications_text_score({ score: '85' }, ru))).toBeVisible()
    await expect(bell(page, 1)).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(`/learn/${course.id}/${task.activity_id}/submission`)
  },
)

test2(
  'B-NOT-03 B-NOT-06 the unread filter lives in the URL; one and all are marked read from the answers',
  async ({ page, learner, makeCourse, announce }) => {
    // 21 announcements (one page and one more) and two reloads under `vp dev`.
    test2.slow()
    const course = await makeCourse({ activities: 1 })
    await learner.enroll(course)
    // One by one: "Новость 20" is the newest.
    for (let index = 0; index < 21; index += 1) await announce(course, `Новость ${index}`)
    await learner.signIn()
    await page.goto('/notifications')
    await expect(page.getByRole('listitem')).toHaveCount(20)
    await page.getByRole('button', { name: m.ui_show_more({}, ru) }).click()
    await expect(page.getByRole('listitem')).toHaveCount(21)
    await expect(page.getByRole('button', { name: m.ui_show_more({}, ru) })).toHaveCount(0)

    await page.getByRole('link', { name: m.notifications_filter_unread({}, ru) }).click()
    await expect(page).toHaveURL('/notifications?unread=true')
    const newest = page.getByRole('listitem').filter({ has: updateLink(page, 'Новость 20', course) })
    await newest.getByRole('button', { name: m.notifications_mark_read({}, ru) }).click()
    await expect(newest.getByText(m.notifications_new({}, ru))).toHaveCount(0)
    await expect(bell(page, 20)).toBeVisible()

    await page.reload()
    await expect(page.getByRole('link', { name: m.notifications_filter_unread({}, ru) })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(updateLink(page, 'Новость 20', course)).toHaveCount(0)
    await page.getByRole('button', { name: m.notifications_mark_all({}, ru) }).click()
    await expect(page.getByText(m.notifications_marked_all({}, ru))).toBeVisible()
    await expect(bell(page)).toBeVisible()
    await page.reload()
    await expect(page.getByText(m.notifications_empty_unread({}, ru))).toBeVisible()
  },
)

test2(
  'B-NOT-08 a read in another tab updates the count and the list',
  async ({ page, context, learner, makeCourse, announce }) => {
    const course = await makeCourse({ activities: 1 })
    await learner.enroll(course)
    const title = await announce(course)
    await learner.signIn()
    await page.goto('/notifications')
    await expect(bell(page, 1)).toBeVisible()
    const other = await context.newPage()
    await other.goto('/notifications')
    await other.getByRole('button', { name: m.notifications_mark_read({}, ru) }).click()
    await expect(bell(other)).toBeVisible()
    await expect(bell(page)).toBeVisible()
    const item = page.getByRole('listitem').filter({ has: updateLink(page, title, course) })
    await expect(item.getByText(m.notifications_new({}, ru))).toHaveCount(0)
    await other.close()
  },
)

test2('B-NOT-09 the per-type switches are saved and read back', async ({ page, api, context, learner }) => {
  await learner.signIn()
  await page.goto('/settings/notifications')
  const section = page.getByRole('form', { name: m.notifications_prefs_title({}, ru) })
  const update = section.getByRole('switch', { name: m.notifications_type_course_update({}, ru) })
  await expect(section.getByRole('switch')).toHaveCount(7)
  await expect(update).toBeChecked()
  await update.click()
  await section.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.notifications_prefs_saved({}, ru))).toBeVisible()
  await page.reload()
  await expect(update).not.toBeChecked()
  await expect(section.getByRole('switch', { name: m.notifications_type_grade_published({}, ru) })).toBeChecked()
  const { headers } = await userIdOf(context, api)
  const { data } = await getNotificationPreferences({ client: api, headers, throwOnError: true })
  expect(data).toMatchObject({ course_update: false, grade_published: true })
})

test2(
  'B-NOT-10 awarded XP shows the ordinary toast unless the profile turned it off',
  async ({ page, api, context, learner, seed }) => {
    await learner.signIn()
    const me = await userIdOf(context, api)
    const admin = { cookie: `${seed.accounts.admin.cookie.name}=${seed.accounts.admin.cookie.value}` }
    const award = (amount: number) =>
      adminAward({ client: api, body: { user_id: me.id, amount }, headers: admin, throwOnError: true })
    // The nav reads the profile (B-ACH-13): each award re-reads it.
    expectReread(page, '/api/v2/gamification')
    await page.goto('/notifications')
    await expect(bell(page)).toBeVisible()
    await award(25)
    await expect(page.getByText(m.notifications_xp_awarded({ amount: '25' }, ru))).toBeVisible()

    await updatePreferences({ client: api, body: { notifications: { xpGain: false } }, headers: me.headers })
    await page.reload()
    await expect(bell(page)).toBeVisible()
    const read = page.waitForResponse(response => response.url().endsWith('/api/v2/gamification'))
    await award(30)
    await read
    await expect(page.getByText(m.notifications_xp_awarded({ amount: '30' }, ru))).toHaveCount(0)
  },
)

for (const locale of ['kk', 'en'] as const) {
  test2(`B-NOT-13 the notifications page and the bell speak ${locale}`, async ({ page, context, baseURL, learner }) => {
    await learner.signIn()
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto('/notifications')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { level: 1, name: m.notifications_title({}, { locale }) })).toBeVisible()
    await expect(page.getByText(m.notifications_empty({}, { locale }))).toBeVisible()
    await page.getByRole('button', { name: m.notifications_title({}, { locale }), exact: true }).click()
    await expect(page.getByRole('heading', { name: m.notifications_latest({}, { locale }) })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/\b(notifications|platform|ui|errors)_[a-z_]+/)
    await page.keyboard.press('Escape')
  })
}
