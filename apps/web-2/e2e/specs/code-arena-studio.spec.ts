import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { getAssessment } from '#/shared/api/gen/sdk.gen'
import type { AssessmentDetail, ReferenceCheckResponse } from '#/shared/api/gen/types.gen'

import type { MadeCourse } from '../fixtures/learning'
import { expect, routeLanguages, ru, test, type Made } from './code-arena-fixture'

// A code challenge in the activity studio (slice 5.3): the `edit` tab holds its code item. The language list comes
// from the sandbox, which the local stack lacks: it is routed for a client navigation from the `settings` tab.

test.describe.configure({ timeout: 60_000 })
test.beforeEach(async ({ signInAs }) => signInAs('teacher'))

const studio = (course: MadeCourse, made: Made, tab: string) =>
  `/teach/courses/${course.id}/activities/${made.activityId}/${tab}`
const form = (page: Page) => page.getByRole('form', { name: m.code_studio_title({}, ru) })
const problemOf = (code: string, status: number) => ({ type: 'about:blank', title: code, status, code })

async function openEdit(page: Page, course: MadeCourse, made: Made) {
  await page.goto(studio(course, made, 'settings'))
  await page.getByRole('link', { name: m.platform_tab_edit({}, ru) }).click()
  await expect(form(page)).toBeVisible()
}

test('B-COD-13 B-COD-14 B-COD-15 B-COD-16 B-COD-17 B-COD-18 the author fills a new challenge and saves it', async ({
  page,
  api,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course, { body: null, publish: false })
  await routeLanguages(page)
  await openEdit(page, course, made)
  const editor = form(page)
  const save = editor.getByRole('button', { name: m.ui_save({}, ru) })

  await editor.getByRole('textbox', { name: m.code_field_prompt({}, ru) }).fill('Сложите два числа')
  await editor.getByLabel(m.code_field_input_spec({}, ru)).fill('a b')
  await editor.getByLabel(m.code_field_constraints({}, ru)).fill('a > 0\nb > 0')
  await editor.getByText('Python (3.8.1)').click()
  const starter = editor.getByRole('textbox', { name: m.code_field_starter({}, ru) })
  await starter.click()
  await page.keyboard.type('print()')

  await expect(editor.getByText(m.code_cases_empty({}, ru))).toBeVisible()
  const add = editor.getByRole('button', { name: m.code_case_add({}, ru) })
  await add.click()
  await add.click()
  const input = editor.getByLabel(m.code_field_input({}, ru), { exact: true })
  const expected = editor.getByLabel(m.code_field_expected({}, ru), { exact: true })
  await input.nth(0).fill('1 2')
  await expected.nth(0).fill('3')
  await input.nth(1).fill('5 5')
  await expected.nth(1).fill('10')
  await editor.getByLabel(m.code_field_weight({}, ru)).nth(1).fill('2')
  await editor.getByText(m.code_field_visible({}, ru)).nth(1).click()
  await expect(editor.getByText(m.code_cases_counts({ visible: 1, hidden: 1 }, ru))).toBeVisible()

  const time = editor.getByLabel(m.code_field_time({}, ru))
  await time.fill('0')
  await save.click()
  await expect(editor.getByText(m.validation_format({}, ru))).toBeVisible()
  await time.fill('2')
  await save.click()
  await expect(page.getByText(m.code_saved({}, ru), { exact: true })).toBeVisible()
  await expect(save).toBeDisabled()

  const path = { assessment_id: made.assessment.id }
  const { data } = await getAssessment({ client: api, path, headers: challenges.teacher, throwOnError: true })
  const item = data.items[0]
  expect(item?.title).toBe('Сумма двух чисел')
  expect(item?.body).toMatchObject({
    kind: 'code',
    input_spec: 'a b',
    constraints: ['a > 0', 'b > 0'],
    languages: [71],
    starter_code: { '71': 'print()' },
    time_limit_seconds: 2,
  })
  expect(item?.body.kind === 'code' ? item.body.tests : []).toMatchObject([
    { input: '1 2', expected_output: '3', is_visible: true, weight: 1 },
    { input: '5 5', expected_output: '10', is_visible: false, weight: 2 },
  ])
})

test('B-COD-19 B-COD-18 the reference check saves first; a refused save keeps the input', async ({
  page,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  await routeLanguages(page)
  const check: ReferenceCheckResponse = {
    results: [
      {
        language_id: 71,
        ok: true,
        status: 'accepted',
        passed: 2,
        total: 2,
        score: 100,
        compile_output: null,
        message: null,
        cases: [],
      },
      {
        language_id: 63,
        ok: false,
        status: 'missing_solution',
        passed: 0,
        total: 2,
        score: null,
        compile_output: null,
        message: 'none',
        cases: [],
      },
    ],
  }
  await page.route(`**/api/v2/assessments/${made.assessment.id}/reference-check`, route =>
    route.fulfill({ json: check }),
  )
  await openEdit(page, course, made)
  const editor = form(page)
  await expect(editor.getByRole('button', { name: m.ui_save({}, ru) })).toBeDisabled()
  const constraints = editor.getByLabel(m.code_field_constraints({}, ru))
  await constraints.fill('1 <= a, b <= 1000')
  const saved = page.waitForRequest(request => request.method() === 'PATCH' && request.url().includes(made.itemId))
  await editor.getByRole('button', { name: m.code_check({}, ru) }).click()
  await saved
  const results = page.getByRole('region', { name: m.code_check_title({}, ru) })
  await expect(results.getByText(m.code_check_ok({}, ru))).toBeVisible()
  await expect(results.getByText(m.code_check_missing({}, ru))).toBeVisible()
  await expect(results.getByText('JavaScript (Node.js 12.14.0)')).toBeVisible()

  await page.route(`**/api/v2/assessment-items/${made.itemId}`, route =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: problemOf('assessment-read-only', 409),
    }),
  )
  await constraints.fill('1 <= a, b <= 10')
  await editor.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(editor.getByText(m.errors_assessment_read_only({}, ru))).toBeVisible()
  await expect(constraints).toHaveValue('1 <= a, b <= 10')
})

test('B-COD-13 without update in allowed_actions the challenge is read only', async ({
  page,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  await routeLanguages(page)
  await page.route(`**/api/v2/activities/${made.activityId}/assessment`, async route => {
    const response = await route.fetch()
    const assessment: AssessmentDetail = await response.json()
    await route.fulfill({ response, json: { ...assessment, allowed_actions: [] } })
  })
  await openEdit(page, course, made)
  await expect(form(page).getByText(m.code_read_only({}, ru))).toBeVisible()
  await expect(form(page).getByRole('button', { name: m.ui_save({}, ru) })).toHaveCount(0)
  await expect(form(page).getByLabel(m.code_field_input_spec({}, ru))).toBeDisabled()
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-COD-20 the challenge editor speaks ${locale}`, async ({ page, context, baseURL, makeCourse, challenges }) => {
    const course = await makeCourse({ activities: 1 })
    const made = await challenges.make(course)
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(studio(course, made, 'edit'))
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { name: m.code_studio_title({}, { locale }) })).toBeVisible()
    await expect(page.getByText(m.code_languages_unavailable({}, { locale }))).toBeVisible()
  })
}
