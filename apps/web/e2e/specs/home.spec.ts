import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createCourseUpdate } from '#/shared/api/gen/sdk.gen'
import { formatDate, formatNumber } from '#/shared/i18n/format'

import { expect, ru, test } from './file-submissions-fixture'

// /home "Today" (slice 3.1): a fresh learner in a made course with file tasks; the teacher grades and announces.

const HOUR = 3600
const now = () => Math.floor(Date.now() / 1000)
const region = (page: Page, name: string) => page.getByRole('region', { name })

test('B-HOME-01 B-HOME-02 B-HOME-03 B-HOME-04 B-HOME-05 B-HOME-06 one page answers what to do today', async ({
  page,
  api,
  context,
  learner,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const dueAt = now() + 72 * HOUR
  const upcoming = await tasks.make(course, { title: 'Скоро срок', due_at_unix: dueAt })
  const late = await tasks.make(course, { title: 'Просрочено', due_at_unix: now() - HOUR })
  const graded = await tasks.make(course, { title: 'Оценено' })
  const returned = await tasks.make(course, { title: 'Возвращено' })
  await learner.enroll(course)
  await learner.signIn()
  const headers = await tasks.headersOf(context)
  await tasks.attach(late, headers, [await tasks.upload(headers)])
  await tasks.grade(await tasks.handIn(graded, headers, [await tasks.upload(headers)]), {
    action: 'publish',
    final_score: 85,
  })
  await tasks.grade(await tasks.handIn(returned, headers, [await tasks.upload(headers)]), {
    action: 'return',
    feedback: 'Добавьте выводы',
  })
  const update = { title: `Объявление ${course.name}`, content: 'Занятие переносится.' }
  await createCourseUpdate({ client: api, path: { course_id: course.id }, body: update, headers: tasks.teacher })

  await page.goto('/home')
  await expect(page.getByRole('heading', { level: 1, name: m.home_title({}, ru) })).toBeVisible()

  const resume = region(page, m.home_continue_title({}, ru))
  await expect(resume.getByRole('heading', { name: course.name })).toBeVisible()
  await expect(resume.getByRole('link', { name: m.home_continue_action({}, ru) })).toHaveAttribute(
    'href',
    `/learn/${course.id}/${course.activityIds[0]}`,
  )

  const deadlines = region(page, m.home_deadlines_title({}, ru))
  await expect(deadlines.getByText(formatDate(dueAt, 'ru'))).toBeVisible()
  await expect(deadlines.getByText(m.activity_type_file_submission({}, ru))).toBeVisible()
  await expect(deadlines.getByText(m.home_state_not_started({}, ru))).toBeVisible()
  await expect(deadlines.getByRole('link', { name: 'Скоро срок' })).toHaveAttribute(
    'href',
    `/learn/${course.id}/${upcoming.activity_id}`,
  )

  const attention = region(page, m.home_attention_title({}, ru))
  await expect(attention.getByText(m.home_kind_overdue({}, ru))).toBeVisible()
  await expect(attention.getByRole('link', { name: 'Просрочено' })).toHaveAttribute(
    'href',
    `/learn/${course.id}/${late.activity_id}`,
  )

  const results = region(page, m.home_results_title({}, ru))
  await expect(results.getByText(m.home_result_published({}, ru))).toBeVisible()
  await expect(results.getByRole('link', { name: 'Оценено' })).toBeVisible()
  await expect(results.getByText(m.home_score({ score: formatNumber(85, {}, 'ru') }, ru))).toBeVisible()
  await expect(results.getByText(m.home_result_returned({}, ru))).toBeVisible()
  // Returned work is a result here, and not repeated under "Needs attention".
  await expect(page.getByRole('link', { name: 'Возвращено', exact: true })).toHaveCount(1)

  const updates = region(page, m.home_updates_title({}, ru))
  await updates.getByRole('link', { name: update.title }).click()
  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}/updates$`))
})

test('B-HOME-07 a learner with no courses gets one sentence and the catalog', async ({ page, learner }) => {
  await learner.signIn()
  await page.goto('/home')
  await expect(page.getByText(m.home_empty({}, ru))).toBeVisible()
  await expect(region(page, m.home_deadlines_title({}, ru))).toHaveCount(0)
  await page.getByRole('link', { name: m.home_find_course({}, ru) }).click()
  await expect(page).toHaveURL(/\/courses$/)
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-HOME-08 /home speaks ${locale}`, async ({ page, context, baseURL, learner, makeCourse }) => {
    const course = await makeCourse({ activities: 1 })
    await learner.enroll(course)
    await learner.signIn()
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto('/home')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { level: 1, name: m.home_title({}, { locale }) })).toBeVisible()
    await expect(page.getByText(m.home_deadlines_empty({}, { locale }))).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/\b(home|achievements|platform|ui)_[a-z_]+/)
  })
}
