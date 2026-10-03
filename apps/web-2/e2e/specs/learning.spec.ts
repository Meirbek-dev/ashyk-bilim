import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'

import { expect, type MadeCourse, test } from '../fixtures/learning'

const ru = { locale: 'ru' } as const

/** The card of one course on /learning (its name is an h2; a certificate's is an h3). */
const card = (page: Page, course: MadeCourse) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: course.name }) })

test('B-LRN-01 B-LRN-07 a new learner gets one sentence per list and a way to the catalog', async ({
  page,
  learner,
}) => {
  await learner.signIn()
  await page.goto('/learning')
  await expect(page.getByRole('heading', { level: 1, name: m.learning_title({}, ru) })).toBeVisible()
  await expect(page.getByText(m.learning_empty({}, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: m.learning_catalog({}, ru) })).toHaveAttribute('href', '/courses')
  await expect(page.getByText(m.learning_certificates_empty({}, ru))).toBeVisible()
})

test('B-LRN-01 B-LRN-02 B-LRN-03 B-LRN-04 started courses show the server progress, the state and a filter in the URL', async ({
  page,
  learner,
  makeCourse,
}) => {
  const [fresh, half, done] = await Promise.all([makeCourse(), makeCourse(), makeCourse()])
  await learner.enroll(fresh)
  await learner.enroll(half, 1)
  await learner.enroll(done, 2)
  await learner.signIn()
  await page.goto('/learning')

  await expect(card(page, fresh)).toContainText(m.learning_state_not_started({}, ru))
  await expect(card(page, half)).toContainText(m.learning_state_in_progress({}, ru))
  await expect(card(page, half)).toContainText(m.learning_progress({ percent: 50 }, ru))
  await expect(card(page, done)).toContainText(m.learning_state_completed({}, ru))
  await expect(card(page, done)).toContainText(m.learning_progress({ percent: 100 }, ru))
  for (const [course, action] of [
    [fresh, m.learning_action_start({}, ru)],
    [half, m.learning_action_continue({}, ru)],
    [done, m.learning_action_open({}, ru)],
  ] as const) {
    await expect(card(page, course).getByRole('link', { name: action })).toHaveAttribute(
      'href',
      `/courses/${course.id}`,
    )
  }

  const filter = page.getByRole('navigation', { name: m.learning_filter_label({}, ru) })
  await filter.getByRole('link', { name: m.learning_state_completed({}, ru) }).click()
  await expect(page).toHaveURL(/\/learning\?state=completed$/)
  await expect(card(page, done)).toBeVisible()
  await expect(card(page, half)).toHaveCount(0)
  await page.reload()
  await expect(card(page, done)).toBeVisible()
  await expect(card(page, fresh)).toHaveCount(0)

  await page.goto('/learning?state=nonsense')
  await expect(card(page, fresh)).toBeVisible()
  await expect(card(page, done)).toBeVisible()
})

test('B-LRN-03 B-LRN-05 B-LRN-06 empty courses say so, archived ones are marked and go last, an empty filter resets', async ({
  page,
  learner,
  makeCourse,
}) => {
  const [archived, empty] = await Promise.all([makeCourse({ activities: 1 }), makeCourse({ activities: 1 })])
  await learner.enroll(archived)
  await learner.enroll(empty)
  await archived.archive()
  await empty.hideActivities()
  await learner.signIn()
  await page.goto('/learning')

  await expect(card(page, empty)).toContainText(m.learning_no_activities({}, ru))
  await expect(card(page, empty)).not.toContainText('%')
  await expect(card(page, archived)).toContainText(m.learning_archived({}, ru))
  const names = await page.getByRole('heading', { level: 2 }).allTextContents()
  expect(names.indexOf(empty.name)).toBeLessThan(names.indexOf(archived.name))

  await page.goto('/learning?state=completed')
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.ui_reset_filters({}, ru) }).click()
  await expect(page).toHaveURL(/\/learning$/)
  await expect(card(page, empty)).toBeVisible()
})

test('B-LRN-07 a finished course lists its certificate with the PDF and the public verify page', async ({
  page,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ certificate: true })
  await learner.enroll(course, 2)
  const code = await learner.certificateCode(course)
  await learner.signIn()
  await page.goto('/learning')

  const certificates = page.getByRole('region', { name: m.learning_certificates_title({}, ru) })
  const item = certificates.getByRole('listitem').filter({ hasText: code })
  await expect(item.getByRole('link', { name: course.name })).toBeVisible()
  const pdf = item.getByRole('link', { name: m.certificates_download_pdf({}, ru) })
  await expect(pdf).toHaveAttribute('href', `/api/v2/certificates/${code}/pdf`)
  const download = await page.request.get(`/api/v2/certificates/${code}/pdf`)
  expect(download.headers()['content-type']).toBe('application/pdf')

  await item.getByRole('link', { name: m.learning_certificate_verify({}, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`/certificates/${code}/verify$`))
  await expect(page.getByText(m.certificates_valid({}, ru))).toBeVisible()
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-LRN-08 /learning speaks ${locale}`, async ({ page, context, baseURL, learner, makeCourse }) => {
    const course = await makeCourse({ certificate: true })
    await learner.enroll(course, 2)
    await learner.certificateCode(course)
    await learner.signIn()
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto('/learning')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { level: 1, name: m.learning_title({}, { locale }) })).toBeVisible()
    await expect(card(page, course)).toContainText(m.learning_state_completed({}, { locale }))
    await expect(page.getByRole('link', { name: m.certificates_download_pdf({}, { locale }) })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/\b(learning|certificates|platform|ui)_[a-z_]+/)
  })
}
