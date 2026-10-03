import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { createUsergroup, deleteUsergroup, deleteView, listSavedViews } from '#/shared/api/gen/sdk.gen'

import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
const NO_SUCH = '00000000-0000-4000-8000-000000000000'
const cookie = (seed: Seed, role: 'teacher' | 'admin') => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}

const test = base.extend<{ api: ReturnType<typeof createClient> }>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
})

// Every analytics test acts as the seeded teacher: the seed course, its learner e2e-student1 (at risk: no progress).
test.beforeEach(async ({ signInAs }) => signInAs('teacher'))

const kpis = (page: import('@playwright/test').Page) => page.getByRole('region', { name: m.analytics_kpis({}, ru) })

test('B-ANL-01 B-ANL-03 the tabs are routes; a tab keeps the filters and drops the drill-down', async ({ page }) => {
  await page.goto('/teach/analytics')
  await expect(page).toHaveURL(/\/teach\/analytics\/overview$/)
  await expect(page.getByRole('heading', { level: 1, name: m.platform_nav_analytics({}, ru) })).toBeVisible()
  await page.goto('/teach/analytics/overview?window=7d&metric=completion_rate')
  await expect(page.getByRole('heading', { level: 2, name: m.analytics_kpi_completion_rate({}, ru) })).toBeVisible()
  await page.getByRole('link', { name: m.platform_tab_learners({}, ru) }).click()
  await expect(page).toHaveURL(/\/teach\/analytics\/learners\?window=7d$/)
})

test('B-ANL-04 filters apply through the URL and survive a reload', async ({ page }) => {
  await page.goto('/teach/analytics/overview')
  const filters = page.getByRole('form', { name: m.ui_filters({}, ru) })
  await filters.getByLabel(m.analytics_filter_window({}, ru)).selectOption('90d')
  await filters.getByLabel(m.analytics_filter_bucket({}, ru)).selectOption('week')
  await filters.getByRole('button', { name: m.analytics_filter_apply({}, ru) }).click()
  await expect(page).toHaveURL(/window=90d&bucket=week|bucket=week&window=90d/)
  await page.reload()
  await expect(filters.getByLabel(m.analytics_filter_window({}, ru))).toHaveValue('90d')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: m.ui_filters_count({ count: 2 }, ru) })).toBeVisible()
})

test('B-ANL-05 B-ANL-06 B-ANL-07 overview: KPI tiles, trends as charts and text, rows behind a tile', async ({
  page,
}) => {
  await page.goto('/teach/analytics/overview')
  for (const label of [m.analytics_kpi_active_learners({}, ru), m.analytics_kpi_at_risk_learners({}, ru)])
    await expect(kpis(page).getByRole('region', { name: label })).toBeVisible()
  for (const series of [m.analytics_series_submissions({}, ru), m.analytics_series_grading({}, ru)]) {
    await expect(page.getByRole('figure', { name: series })).toBeVisible()
    await expect(page.getByRole('img', { name: series })).toBeVisible()
    await expect(page.getByRole('table', { name: series })).toBeAttached()
  }
  const completion = kpis(page).getByRole('region', { name: m.analytics_kpi_completion_rate({}, ru) })
  await completion.getByRole('link', { name: m.analytics_show_rows({}, ru) }).click()
  await expect(page).toHaveURL(/metric=completion_rate/)
  const rows = page.getByRole('table', { name: m.analytics_kpi_completion_rate({}, ru) })
  await expect(rows.getByRole('cell', { name: 'E2E student1' }).first()).toBeVisible()
  await page.getByRole('link', { name: m.analytics_hide_rows({}, ru) }).click()
  await expect(page).not.toHaveURL(/metric=/)
})

test('B-ANL-08 B-ANL-09 learners: risk counts, the at-risk list, its sort in the URL', async ({ page }) => {
  await page.goto('/teach/analytics/learners')
  await expect(kpis(page).getByRole('region', { name: m.analytics_tile_risk_high({}, ru) })).toBeVisible()
  await expect(kpis(page).getByRole('region', { name: m.analytics_interventions_total({}, ru) })).toBeVisible()
  const table = page.getByRole('table', { name: m.analytics_at_risk_table({}, ru) })
  await expect(table.getByRole('link', { name: 'E2E student1' }).first()).toBeVisible()
  await table.getByRole('button', { name: m.analytics_col_progress({}, ru) }).click()
  await expect(page).toHaveURL(/sort=progress/)
  await expect(table.getByRole('columnheader', { name: m.analytics_col_progress({}, ru) })).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
})

test('B-ANL-10 B-ANL-11 the learner panel: history, a new intervention without a refetch', async ({ page, seed }) => {
  const learner = seed.accounts.student.session.user_id
  await page.goto(`/teach/analytics/learners?learnerId=${learner}&courseId=${seed.params.courseId}`)
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('heading', { name: m.analytics_interventions_title({}, ru) })).toBeVisible()
  await panel.getByRole('button', { name: m.analytics_intervention_new({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.analytics_intervention_new({}, ru) })
  await dialog.getByLabel(m.analytics_col_type({}, ru)).selectOption('meeting_scheduled')
  await dialog.getByLabel(m.analytics_intervention_status({}, ru)).selectOption('planned')
  const note = `E2E заметка ${randomUUID().slice(0, 8)}`
  await dialog.getByLabel(m.analytics_intervention_notes({}, ru)).fill(note)
  const posted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/interventions'))
  await dialog.getByRole('button', { name: m.analytics_intervention_submit({}, ru) }).click()
  expect((await posted).headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  await expect(page.getByText(m.analytics_intervention_created({}, ru))).toBeVisible()
  const entry = page.getByRole('listitem').filter({ hasText: note })
  await expect(entry).toContainText(m.analytics_intervention_meeting_scheduled({}, ru))
  await expect(entry).toContainText(m.analytics_intervention_status_planned({}, ru))
})

test('B-ANL-12 B-ANL-13 performance: courses and assessments; a course opens its drill-down', async ({
  page,
  seed,
}) => {
  await page.goto('/teach/analytics/performance')
  await expect(page.getByRole('table', { name: m.analytics_assessments_table({}, ru) })).toBeVisible()
  const courses = page.getByRole('table', { name: m.analytics_courses_table({}, ru) })
  await courses.getByRole('link', { name: 'E2E seed course', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`courseId=${seed.params.courseId}`))
  await expect(page.getByRole('heading', { level: 2, name: 'E2E seed course' })).toBeVisible()
  await expect(kpis(page).getByRole('region', { name: m.analytics_course_enrolled({}, ru) })).toBeVisible()
  await expect(page.getByRole('heading', { name: m.analytics_dropoff_table({}, ru) })).toBeVisible()
  await page.getByRole('link', { name: m.analytics_back({}, ru) }).click()
  await expect(page).not.toHaveURL(/courseId=/)
  await page.goto(`/teach/analytics/performance?courseId=${NO_SUCH}`)
  await expect(page.getByRole('heading', { name: m.analytics_not_found_title({}, ru) })).toBeVisible()
})

test('B-ANL-14 an assessment drill-down: summary, score spread, each learner', async ({ page }) => {
  await page.goto('/teach/analytics/performance')
  const assessments = page.getByRole('table', { name: m.analytics_assessments_table({}, ru) })
  const row = assessments.getByRole('row').filter({ hasText: 'E2E seed course' }).filter({ hasText: 'Quiz' })
  await row.getByRole('link', { name: 'Quiz', exact: true }).click()
  await expect(page).toHaveURL(/assessmentType=quiz&assessmentId=/)
  await expect(page.getByRole('heading', { level: 2, name: 'Quiz' })).toBeVisible()
  await expect(page.getByRole('figure', { name: m.analytics_score_distribution({}, ru) })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: m.analytics_pass_rows({}, ru) })).toBeVisible()
  await page.goto(`/teach/analytics/performance?assessmentType=quiz&assessmentId=${NO_SUCH}`)
  await expect(page.getByRole('heading', { name: m.analytics_not_found_title({}, ru) })).toBeVisible()
})

test('B-ANL-15 operations: queue tiles, its age as a chart and text, the queue table', async ({ page }) => {
  await page.goto('/teach/analytics/operations')
  await expect(kpis(page).getByRole('region', { name: m.analytics_sla_breaches({}, ru) })).toBeVisible()
  await expect(page.getByRole('figure', { name: m.analytics_aging_title({}, ru) })).toBeVisible()
  await expect(page.getByRole('table', { name: m.analytics_aging_title({}, ru) })).toContainText(
    m.analytics_age_older({}, ru),
  )
  await expect(page.getByRole('heading', { level: 2, name: m.analytics_backlog_table({}, ru) })).toBeVisible()
  const queue = kpis(page).getByRole('region', { name: m.analytics_kpi_ungraded_submissions({}, ru) })
  await queue.getByRole('link', { name: m.analytics_show_rows({}, ru) }).click()
  await expect(page).toHaveURL(/metric=backlog/)
  await expect(
    page.getByRole('heading', { level: 2, name: m.analytics_kpi_ungraded_submissions({}, ru) }),
  ).toBeVisible()
})

test('B-ANL-16 CSV exports are links with the filters and the time zone', async ({ page }) => {
  await page.goto('/teach/analytics/learners?window=7d')
  const link = page.getByRole('link', { name: m.analytics_export_at_risk({}, ru) })
  const href = (await link.getAttribute('href')) ?? ''
  expect(href).toMatch(/^\/api\/v2\/analytics\/teacher\/exports\/at-risk\.csv\?.*window=7d/)
  expect(href).toContain('timezone=Asia%2FAlmaty')
  const response = await page.request.get(href)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/csv')
})

test('B-ANL-17 a saved view keeps the tab and filters, applies them, and is deleted after a confirmation', async ({
  page,
  api,
  seed,
}) => {
  const name = `E2E вид ${randomUUID().slice(0, 8)}`
  try {
    await page.goto('/teach/analytics/operations?window=90d')
    await page.getByRole('button', { name: m.analytics_view_save({}, ru) }).click()
    const dialog = page.getByRole('dialog', { name: m.analytics_view_save({}, ru) })
    await dialog.getByRole('button', { name: m.ui_save({}, ru) }).click()
    await expect(dialog.getByText(m.validation_required({}, ru))).toBeVisible()
    await dialog.getByLabel(m.analytics_view_name({}, ru)).fill(name)
    await dialog.getByRole('button', { name: m.ui_save({}, ru) }).click()
    await expect(page.getByText(m.analytics_view_saved({}, ru))).toBeVisible()
    await page.goto('/teach/analytics/overview')
    await page
      .getByRole('region', { name: m.analytics_views_title({}, ru) })
      .getByRole('link', { name })
      .click()
    await expect(page).toHaveURL(/\/teach\/analytics\/operations\?window=90d$/)
    await page.getByRole('button', { name: m.analytics_view_delete({ name }, ru) }).click()
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await confirm.getByRole('button', { name: m.analytics_view_delete_confirm({}, ru) }).click()
    await expect(page.getByText(m.analytics_view_deleted({}, ru))).toBeVisible()
    await expect(page.getByRole('link', { name })).toHaveCount(0)
  } finally {
    const views = await listSavedViews({ client: api, headers: cookie(seed, 'teacher'), throwOnError: true })
    for (const view of views.data.items.filter(item => item.name === name))
      await deleteView({ client: api, path: { view_id: view.id }, headers: cookie(seed, 'teacher') })
  }
})

test('B-ANL-19 a filter nobody matches: "no matches" and a reset', async ({ page, api, seed }) => {
  const { data: group } = await createUsergroup({
    client: api,
    body: { name: `E2E пустая группа ${randomUUID().slice(0, 8)}` },
    headers: cookie(seed, 'teacher'),
    throwOnError: true,
  })
  try {
    await page.goto(`/teach/analytics/learners?cohort=${group.id}`)
    await expect(page.getByText(m.ui_no_matches({}, ru)).first()).toBeVisible()
    await page
      .getByRole('button', { name: m.ui_reset_filters({}, ru) })
      .first()
      .click()
    await expect(page).not.toHaveURL(/cohort=/)
  } finally {
    await deleteUsergroup({ client: api, path: { usergroup_id: group.id }, headers: cookie(seed, 'teacher') })
  }
})

test('B-ANL-22 an unknown group leaves the URL before any read', async ({ page }) => {
  await page.goto(`/teach/analytics/learners?window=7d&cohort=${NO_SUCH}`)
  await expect(page).toHaveURL(/\/teach\/analytics\/learners\?window=7d$/)
  await expect(page.getByRole('heading', { level: 1, name: m.platform_nav_analytics({}, ru) })).toBeVisible()
})

test('B-ANL-20 the admin overview ranks the platform; a teacher has no access', async ({ page, signInAs }) => {
  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })).toBeVisible()
  await page.context().clearCookies()
  await signInAs('admin')
  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { level: 1, name: m.analytics_admin_title({}, ru) })).toBeVisible()
  const courses = page.getByRole('table', { name: m.analytics_admin_courses({}, ru) })
  await expect(courses.getByText('E2E seed course', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('table', { name: m.analytics_admin_teachers({}, ru) })).toContainText('E2E teacher')
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-ANL-21 analytics speaks ${locale}`, async ({ page, context, baseURL, signInAs }) => {
    test.slow() // five screens in one test
    await context.clearCookies()
    await signInAs('admin')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    for (const path of ['overview', 'learners', 'performance', 'operations']) {
      await page.goto(`/teach/analytics/${path}`)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(
        page.getByRole('heading', { level: 1, name: m.platform_nav_analytics({}, { locale }) }),
      ).toBeVisible()
      await expect(page.locator('body')).not.toContainText(/\b(analytics|platform|ui)_[a-z_]+/)
    }
    await page.goto('/admin/analytics')
    await expect(page.getByRole('heading', { level: 1, name: m.analytics_admin_title({}, { locale }) })).toBeVisible()
  })
}
