import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'

import { expect, ru, test } from './course-studio-fixture'

// /teach/courses, the workspace frame, overview and publish (slice 4.1). Every test acts as the teacher.

const tab = (courseId: string, name: string) => `/teach/courses/${courseId}/${name}`

test.beforeEach(async ({ signInAs }) => signInAs('teacher'))

test('B-CST-01 the list shows my courses with status, update date and the server count', async ({ page, studio }) => {
  const { course } = await studio.course()
  await page.goto(`/teach/courses?q=${encodeURIComponent(course.name)}`)
  await expect(page.getByRole('heading', { level: 1, name: m.studio_courses_title({}, ru) })).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: course.name })
  await expect(card.getByRole('link', { name: course.name })).toHaveAttribute('href', tab(course.id, 'overview'))
  await expect(card.getByText(m.studio_status_draft({}, ru))).toBeVisible()
  await expect(card.getByText(/^Изменён /)).toBeVisible()
  await expect(page.getByText(/^\d+ курс(а|ов)?$/)).toBeVisible()
})

test('B-CST-02 search and preset live in the URL; no match offers to reset', async ({ page, studio }) => {
  const { course } = await studio.course()
  await page.goto('/teach/courses')
  const box = page.getByRole('searchbox', { name: m.studio_search_label({}, ru) })
  await box.fill(course.name)
  await box.press('Enter')
  await expect(page).toHaveURL(/q=E2E/)
  await page.reload()
  await expect(page.getByRole('link', { name: course.name })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(`^${m.studio_preset_published({}, ru)}`) }).click()
  await expect(page).toHaveURL(/preset=published/)
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.ui_reset_filters({}, ru) }).click()
  await expect(page).toHaveURL(/\/teach\/courses$/)
})

test('B-CST-03 a new course: the name is required, then its overview opens', async ({ page, studio }) => {
  await page.goto('/teach/courses')
  await page.getByRole('button', { name: m.studio_new_course({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.studio_new_course({}, ru) })
  await dialog.getByRole('button', { name: m.studio_create_submit({}, ru) }).click()
  await expect(dialog.getByText(m.validation_required({}, ru))).toBeVisible()
  const name = `E2E studio ${randomUUID().slice(0, 8)}`
  await dialog.getByRole('textbox', { name: m.studio_field_name({}, ru) }).fill(name)
  await dialog.getByRole('button', { name: m.studio_create_submit({}, ru) }).click()
  await expect(page.getByText(m.studio_course_created({}, ru))).toBeVisible()
  await expect(page).toHaveURL(/\/teach\/courses\/[\w-]+\/overview$/)
  studio.track(new URL(page.url()).pathname.split('/')[3] ?? '')
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText(m.studio_status_draft({}, ru)).first()).toBeVisible()
})

test('B-CST-33 a new course copied from one of mine opens the copy', async ({ page, studio }) => {
  const { course } = await studio.course()
  await page.goto('/teach/courses')
  await page.getByRole('button', { name: m.studio_new_course({}, ru) }).click()
  const dialog = page.getByRole('dialog', { name: m.studio_new_course({}, ru) })
  const name = `E2E copy ${randomUUID().slice(0, 8)}`
  await dialog.getByRole('textbox', { name: m.studio_field_name({}, ru) }).fill(name)
  await dialog.getByRole('combobox', { name: m.studio_field_source({}, ru) }).selectOption(course.id)
  await expect(dialog.getByRole('textbox', { name: m.studio_field_about({}, ru) })).toHaveCount(0)
  await dialog.getByRole('button', { name: m.studio_create_submit({}, ru) }).click()
  await expect(page).toHaveURL(/\/teach\/courses\/[\w-]+\/overview$/)
  const copyId = new URL(page.url()).pathname.split('/')[3] ?? ''
  studio.track(copyId)
  expect(copyId).not.toBe(course.id)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
})

test('B-CST-04 the workspace: name, status, 7 tabs; not found; another teacher’s course is no access', async ({
  page,
  studio,
}) => {
  const { course } = await studio.course()
  await page.goto(tab(course.id, 'overview'))
  await expect(page.getByRole('heading', { level: 1, name: course.name })).toBeVisible()
  const tabs = page.getByRole('navigation', { name: m.ui_sections({}, ru) }).getByRole('link')
  await expect(tabs).toHaveCount(7)
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page')
  await page.goto(tab(randomUUID(), 'overview'))
  await expect(page.getByRole('heading', { name: m.course_not_found({}, ru) })).toBeVisible()
  const foreign = await studio.course({ owner: 'admin', chapters: [{ pages: [{ published: true }] }], publish: true })
  await page.goto(tab(foreign.course.id, 'overview'))
  await expect(page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })).toBeVisible()
})

test('B-CST-05 overview lists blockers and warnings with links to fix them, or says it is ready', async ({
  page,
  studio,
}) => {
  const draft = await studio.course({ chapters: [{ pages: [{ name: 'Черновая страница' }] }] })
  await page.goto(tab(draft.course.id, 'overview'))
  const blockers = page.getByRole('region', { name: m.studio_readiness_blockers({}, ru) })
  await expect(blockers.getByText(m.studio_readiness_no_live_activity({}, ru))).toBeVisible()
  await expect(blockers.getByRole('link', { name: m.studio_go_content({}, ru) })).toHaveAttribute(
    'href',
    tab(draft.course.id, 'content'),
  )
  const warnings = page.getByRole('region', { name: m.studio_readiness_warnings({}, ru) })
  const activity = draft.chapters[0]?.activities[0]
  await expect(warnings.getByRole('link', { name: 'Черновая страница' })).toHaveAttribute(
    'href',
    `/teach/courses/${draft.course.id}/activities/${activity?.id}/edit`,
  )
  await expect(warnings.getByRole('link', { name: m.studio_go_settings({}, ru) }).first()).toHaveAttribute(
    'href',
    tab(draft.course.id, 'settings'),
  )
  const ready = await studio.course({ chapters: [{ pages: [{ published: true }] }] })
  await page.goto(tab(ready.course.id, 'overview'))
  await expect(page.getByText(m.studio_readiness_ready({}, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: m.studio_go_publish({}, ru) })).toBeVisible()
})

test('B-CST-23 publish is offered only without blockers and marks the course published', async ({ page, studio }) => {
  const empty = await studio.course()
  await page.goto(tab(empty.course.id, 'publish'))
  await expect(page.getByRole('button', { name: m.studio_publish({}, ru) })).toBeDisabled()
  await expect(page.getByText(m.studio_publish_blocked({}, ru))).toBeVisible()
  const ready = await studio.course({ chapters: [{ pages: [{ published: true }] }] })
  await page.goto(tab(ready.course.id, 'publish'))
  await page.getByRole('button', { name: m.studio_publish({}, ru) }).click()
  await expect(page.getByText(m.studio_published({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_status_published({}, ru)).first()).toBeVisible()
  await expect(page.getByRole('button', { name: m.studio_publish({}, ru) })).toHaveCount(0)
})

test('B-CST-24 unpublishing asks first (learners lose access) and returns the course to draft', async ({
  page,
  studio,
}) => {
  const { course } = await studio.course({ chapters: [{ pages: [{ published: true }] }], publish: true })
  await page.goto(tab(course.id, 'publish'))
  await page.getByRole('button', { name: m.studio_unpublish({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.studio_unpublish_title({ name: course.name }, ru) })
  await expect(confirm.getByText(m.studio_unpublish_consequence({}, ru))).toBeVisible()
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.studio_unpublish({}, ru) }).click()
  await expect(page.getByText(m.studio_unpublished({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_status_draft({}, ru)).first()).toBeVisible()
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-CST-31 the workspace and studio speak ${locale}`, async ({ page, context, baseURL, studio }) => {
    // Eight page loads: three times the default timeout.
    test.slow()
    const made = await studio.course({ chapters: [{ pages: [{ name: 'Page' }] }] })
    const activity = made.chapters[0]?.activities[0]
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    const pages = [
      ['/teach/courses', m.studio_courses_title({}, { locale })],
      ...['overview', 'content', 'learners', 'team', 'settings', 'publish'].map(name => [
        tab(made.course.id, name),
        made.course.name,
      ]),
    ] as const
    for (const [path, title] of pages) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.locator('body')).not.toContainText(/\b(studio|platform|ui|errors)_[a-z_]+/)
    }
    await page.goto(`/teach/courses/${made.course.id}/activities/${activity?.id}/settings`)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByText(m.studio_activity_settings_hint({}, { locale }))).toBeVisible()
  })
}
