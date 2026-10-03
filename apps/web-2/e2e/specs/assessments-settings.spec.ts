import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import {
  enroll,
  getAccess,
  getActivityAssessment,
  lifecycle,
  setAccess,
  updateAssessment,
} from '#/shared/api/gen/sdk.gen'

import { makeAssessment, readyChoice, studioUrl } from './assessments-fixture'
import { cookieOf, expect, ru, test } from './course-studio-fixture'

// Settings of an assessment (slice 5.1): rules, access, exceptions, publishing, copy, log; the header switch.

test.use({ as: 'teacher' })

const section = (page: Page, name: string) => page.getByRole('form', { name })
const publishing = (page: Page) => page.locator('#publishing')

test('B-ASM-16 B-ASM-17 B-ASM-18 an exam saves its basics and rules, with its protection; a stale save is retried', async ({
  page,
  studio,
  seed,
}) => {
  const { courseId, assessment, headers } = await makeAssessment(studio, seed, { kind: 'exam', title: 'Экзамен' })
  await page.goto(studioUrl(courseId, assessment.activity_id, 'settings'))
  for (const label of [m.assessments_nav_rules, m.assessments_nav_access, m.assessments_nav_journal]) {
    await expect(page.getByRole('link', { name: label({}, ru), exact: true })).toBeVisible()
  }
  const details = section(page, m.assessments_nav_details({}, ru))
  await details.getByLabel(m.assessments_field_weight({}, ru)).fill('25')
  await details.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.assessments_saved({}, ru))).toBeVisible()
  const rules = section(page, m.assessments_nav_rules({}, ru))
  await expect(rules.getByText(m.assessments_anti_cheat_title({}, ru))).toBeVisible()
  await rules.getByLabel(m.assessments_field_attempts({}, ru)).fill('2')
  await rules.getByLabel(m.assessments_field_time_limit({}, ru)).fill('30')
  await rules.getByLabel(m.assessments_field_due({}, ru)).fill('2030-01-15T10:00')
  await rules.getByRole('switch', { name: m.assessments_field_copy_paste({}, ru) }).click()
  await rules.getByRole('button', { name: m.ui_save({}, ru) }).click()
  const read = async () =>
    (
      await getActivityAssessment({
        client: studio.api,
        path: { activity_id: assessment.activity_id },
        headers,
        throwOnError: true,
      })
    ).data
  await expect.poll(async () => (await read()).policy.max_attempts).toBe(2)
  const saved = await read()
  expect(saved.weight).toBe(25)
  expect(saved.policy.time_limit_seconds).toBe(1800)
  // 10:00 in Almaty (UTC+5).
  expect(saved.policy.due_at_unix).toBe(Date.UTC(2030, 0, 15, 5, 0) / 1000)
  expect(saved.policy.copy_paste_protection).toBe(!assessment.policy.copy_paste_protection)
  // Someone else saves the assessment meanwhile: the next rules save is stale (412) and is retried over it.
  // (A fresh page: each rules save reads readiness again.)
  await page.reload()
  const path = { assessment_id: assessment.id }
  const ifMatch = { ...headers, 'If-Match': saved.version }
  await updateAssessment({ client: studio.api, path, body: { weight: 30 }, headers: ifMatch, throwOnError: true })
  await rules.getByLabel(m.assessments_field_attempts({}, ru)).fill('3')
  await rules.getByRole('button', { name: m.ui_save({}, ru) }).click()
  const dialog = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
  await dialog.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect.poll(async () => (await read()).policy.max_attempts).toBe(3)
  expect((await read()).weight).toBe(30)
})

test('B-ASM-19 B-ASM-20 access: nobody chosen asks first; a stale save opens the conflict dialog', async ({
  page,
  studio,
  seed,
}) => {
  const { courseId, assessment, headers } = await makeAssessment(studio, seed)
  await page.goto(studioUrl(courseId, assessment.activity_id, 'settings'))
  const access = section(page, m.assessments_nav_access({}, ru))
  await access.getByRole('radio', { name: m.assessments_access_restricted({}, ru) }).click()
  await access.getByRole('button', { name: m.ui_save({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.assessments_access_empty_title({}, ru) })
  await confirm.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.assessments_access_saved({}, ru))).toBeVisible()
  const path = { assessment_id: assessment.id }
  await expect.poll(async () => (await getAccess({ client: studio.api, path, headers })).data?.mode).toBe('restricted')
  // Someone else opens it to everyone meanwhile.
  const current = await getActivityAssessment({
    client: studio.api,
    path: { activity_id: assessment.activity_id },
    headers,
    throwOnError: true,
  })
  await setAccess({
    client: studio.api,
    path,
    body: { mode: 'all_course_learners' },
    headers: { ...headers, 'If-Match': current.data.policy_version },
    throwOnError: true,
  })
  await access.getByRole('radio', { name: m.assessments_access_all({}, ru) }).click()
  await access.getByRole('button', { name: m.ui_save({}, ru) }).click()
  const dialog = page.getByRole('alertdialog', { name: m.ui_conflict_title({}, ru) })
  await dialog.getByRole('button', { name: m.ui_conflict_retry({}, ru) }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(m.assessments_access_saved({}, ru)).first()).toBeVisible()
})

test('B-ASM-21 a learner gets an exception, it is changed and removed', async ({ page, studio, seed }) => {
  const { courseId, assessment } = await makeAssessment(studio, seed, { published: true })
  await enroll({
    client: studio.api,
    path: { course_id: courseId },
    headers: cookieOf(seed, 'student'),
    throwOnError: true,
  })
  const { display_name: name, username } = seed.accounts.student.session.user
  await page.goto(studioUrl(courseId, assessment.activity_id, 'settings'))
  await expect(page.getByText(m.assessments_exceptions_empty({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.assessments_exception_add({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.assessments_nav_exceptions({}, ru) })
  await dialog.getByLabel(m.assessments_field_learner({}, ru)).selectOption({ label: `${name} (@${username})` })
  await dialog.getByLabel(m.assessments_field_attempts_override({}, ru)).fill('3')
  await dialog.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.assessments_exception_saved({}, ru))).toBeVisible()
  await expect(page.getByText(m.assessments_exception_attempts({ count: '3' }, ru))).toBeVisible()
  await page.getByRole('button', { name: m.assessments_exception_edit({ name }, ru) }).click()
  const edit = page.getByRole('dialog', { name: m.assessments_nav_exceptions({}, ru) })
  await edit.getByLabel(m.assessments_field_attempts_override({}, ru)).fill('4')
  await edit.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.assessments_exception_attempts({ count: '4' }, ru))).toBeVisible()
  await page.getByRole('button', { name: m.assessments_exception_remove({ name }, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.assessments_exception_remove_title({ name }, ru) })
  await confirm.getByRole('button', { name: m.assessments_exception_remove_confirm({}, ru) }).click()
  await expect(page.getByText(m.assessments_exception_removed({}, ru))).toBeVisible()
  await expect(page.getByText(m.assessments_exceptions_empty({}, ru))).toBeVisible()
})

test('B-ASM-22 B-ASM-24 readiness links to the question; the header switch publishes once ready', async ({
  page,
  studio,
  seed,
}) => {
  const blank = readyChoice('Пустой')
  const items = [{ ...blank, body: { ...blank.body, prompt: '' } }]
  const { courseId, assessment } = await makeAssessment(studio, seed, { items })
  await page.goto(studioUrl(courseId, assessment.activity_id, 'settings'))
  const issue = `${m.assessments_blockers({}, ru)}: ${m.assessments_issue_choice_prompt_missing({}, ru)}`
  await expect(publishing(page).getByText(issue)).toBeVisible()
  const published = page.getByRole('switch', { name: m.assessments_published_switch({}, ru) })
  await published.click()
  await expect(page.getByRole('alert').filter({ hasText: m.assessments_not_ready({}, ru) })).toBeVisible()
  await expect(published).not.toBeChecked()
  await publishing(page)
    .getByRole('link', { name: m.assessments_issue_open({ title: 'Пустой' }, ru) })
    .click()
  await expect(page).toHaveURL(/\/edit\?item=/)
  await page.getByRole('textbox', { name: m.assessments_field_prompt({}, ru) }).fill('Сколько?')
  await expect(page.getByText(m.studio_save_saved({}, ru), { exact: true })).toBeVisible({ timeout: 10_000 })
  await published.click()
  await expect(page.getByText(m.assessments_toast_published({}, ru)).first()).toBeVisible()
  await expect(published).toBeChecked()
  await published.click()
  const confirm = page.getByRole('alertdialog', { name: m.assessments_unpublish_title({ title: 'Тест E2E' }, ru) })
  await confirm.getByRole('button', { name: m.assessments_unpublish({}, ru) }).click()
  await expect(page.getByText(m.assessments_toast_unpublished({}, ru))).toBeVisible()
  await expect(published).not.toBeChecked()
})

test('B-ASM-23 schedule, unschedule, archive and restore', async ({ page, studio, seed }) => {
  const { courseId, assessment } = await makeAssessment(studio, seed, { items: [readyChoice('Готов')] })
  await page.goto(studioUrl(courseId, assessment.activity_id, 'settings'))
  const area = publishing(page)
  await area.getByLabel(m.assessments_schedule_at({}, ru)).fill('2030-01-01T10:00')
  await area.getByRole('button', { name: m.assessments_schedule({}, ru) }).click()
  await expect(page.getByText(m.assessments_toast_scheduled({}, ru))).toBeVisible()
  await expect(area.getByText(m.assessments_lifecycle_scheduled({}, ru), { exact: true })).toBeVisible()
  await area.getByRole('button', { name: m.assessments_unschedule({}, ru) }).click()
  await expect(page.getByText(m.assessments_toast_unscheduled({}, ru))).toBeVisible()
  await area.getByRole('button', { name: m.assessments_archive({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.assessments_archive_title({ title: 'Тест E2E' }, ru) })
  await confirm.getByRole('button', { name: m.assessments_archive({}, ru) }).click()
  await expect(area.getByText(m.assessments_lifecycle_archived({}, ru), { exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: m.assessments_published_switch({}, ru) })).toBeDisabled()
  await area.getByRole('button', { name: m.assessments_restore({}, ru) }).click()
  await expect(page.getByText(m.assessments_toast_restored({}, ru))).toBeVisible()
  await expect(area.getByText(m.assessments_lifecycle_draft({}, ru), { exact: true })).toBeVisible()
})

test('B-ASM-25 B-ASM-26 a copy opens its own studio; the log names the transitions and who', async ({
  page,
  studio,
  seed,
}) => {
  const { courseId, assessment, headers } = await makeAssessment(studio, seed, { items: [readyChoice('Один')] })
  const path = { assessment_id: assessment.id }
  await lifecycle({ client: studio.api, path, body: { to: 'published' }, headers, throwOnError: true })
  await page.goto(studioUrl(courseId, assessment.activity_id, 'settings'))
  await page.getByRole('button', { name: m.assessments_journal_show({}, ru) }).click()
  const journal = page.locator('#journal')
  await expect(journal.getByText(m.assessments_event_lifecycle_transition({}, ru))).toBeVisible()
  const transition = m.assessments_event_transition(
    { from: m.assessments_lifecycle_draft({}, ru), to: m.assessments_lifecycle_published({}, ru) },
    ru,
  )
  await expect(journal.getByText(transition)).toBeVisible()
  await expect(journal.getByText(m.assessments_actor_you({}, ru), { exact: true })).toBeVisible()
  await page.getByRole('button', { name: m.assessments_copy({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.assessments_copy({}, ru) })
  await expect(dialog.getByLabel(m.assessments_copy_field({}, ru))).toHaveValue('Тест E2E (копия)')
  await dialog.getByRole('button', { name: m.assessments_copy({}, ru) }).click()
  await expect(page.getByText(m.assessments_copied({}, ru))).toBeVisible()
  await expect(page).not.toHaveURL(new RegExp(assessment.activity_id))
  await expect(page).toHaveURL(/\/edit$/)
  await expect(page.getByRole('link', { name: '1. Один' })).toBeVisible()
})

test('B-ASM-27 the builder and settings work in kk and en', async ({ page, studio, seed, context, baseURL }) => {
  const { courseId, assessment } = await makeAssessment(studio, seed, { items: [readyChoice('Бір')] })
  for (const locale of ['kk', 'en'] as const) {
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(studioUrl(courseId, assessment.activity_id))
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('button', { name: m.assessments_item_add({}, { locale }) })).toBeVisible()
    await page.goto(studioUrl(courseId, assessment.activity_id, 'settings'))
    await expect(page.getByRole('heading', { name: m.assessments_settings_title({}, { locale }) })).toBeVisible()
    await expect(page.getByText(m.assessments_ready({}, { locale }))).toBeVisible()
  }
})
