import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { adminOverview } from '#/shared/api/gen/sdk.gen'
import { PLATFORM_TIME_ZONE } from '#/shared/i18n/format'

import { expect, test } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
test.use({ as: 'teacher' })

test('B-ANL-20 the admin overview ranks the platform; a teacher has no access', async ({
  page,
  signInAs,
  baseURL,
  seed,
}) => {
  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })).toBeVisible()
  await page.context().clearCookies()
  await signInAs('admin')
  const api = createClient(createConfig({ baseUrl: String(baseURL) }))
  const { data } = await adminOverview({
    client: api,
    headers: { cookie: `${seed.accounts.admin.cookie.name}=${seed.accounts.admin.cookie.value}` },
    query: { timezone: PLATFORM_TIME_ZONE },
    throwOnError: true,
  })
  const [course] = data.course_health_ranking
  const [teacher] = data.teacher_workload_comparison
  if (!course || !teacher) throw new Error('The seeded platform must have course and teacher rankings')
  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { level: 1, name: m.analytics_admin_title({}, ru) })).toBeVisible()
  const courses = page.getByRole('table', { name: m.analytics_admin_courses({}, ru) })
  await expect(courses.getByText(course.course_name, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('table', { name: m.analytics_admin_teachers({}, ru) })).toContainText(
    teacher.teacher_display_name,
  )
})
