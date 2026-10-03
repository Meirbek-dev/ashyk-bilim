import { m } from '#/paraglide/messages'
import { applyContributor, enroll, updateCourse } from '#/shared/api/gen/sdk.gen'

import { cookieOf, expect, ru, test } from './course-studio-fixture'

// The `learners` and `team` tabs (slice 4.1): access, linked groups, co-authors and applications.

const tab = (courseId: string, name: string) => `/teach/courses/${courseId}/${name}`

test.use({ as: 'teacher' })

test('B-CST-13 learners says who sees the course, by its status', async ({ page, studio }) => {
  const draft = await studio.course()
  await page.goto(tab(draft.course.id, 'learners'))
  await expect(page.getByText(m.studio_access_draft({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_groups_empty({}, ru))).toBeVisible()
  const published = await studio.course({ chapters: [{ pages: [{ published: true }] }], publish: true })
  await page.goto(tab(published.course.id, 'learners'))
  await expect(page.getByText(m.studio_access_published({}, ru))).toBeVisible()
})

test('B-CST-35 learners lists who enrolled; one is removed from the course after a confirmation', async ({
  page,
  studio,
  seed,
}) => {
  const { course } = await studio.course({ chapters: [{ pages: [{ published: true }] }], publish: true })
  const student = cookieOf(seed, 'student')
  await enroll({ client: studio.api, path: { course_id: course.id }, headers: student, throwOnError: true })
  await page.goto(tab(course.id, 'learners'))
  const learners = page.getByRole('region', { name: m.studio_learners_title({}, ru) })
  const row = learners.getByRole('listitem').filter({ hasText: '@e2e-student1' })
  await expect(row).toContainText('0 %')
  await row.getByRole('button', { name: m.studio_learner_remove({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: /^Исключить «/ })
  await expect(confirm.getByText(m.studio_learner_remove_consequence({}, ru))).toBeVisible()
  await confirm.getByRole('button', { name: m.studio_learner_remove({}, ru) }).click()
  await expect(page.getByText(m.studio_learner_removed({}, ru))).toBeVisible()
  await expect(learners.getByText(m.studio_learners_empty({}, ru))).toBeVisible()
})

test('B-CST-14 a group is linked from the choices and unlinked after a confirmation', async ({ page, studio }) => {
  const { course } = await studio.course()
  await page.goto(tab(course.id, 'learners'))
  await page.getByRole('combobox', { name: m.studio_group_link({}, ru) }).click()
  // Parallel workers on a fresh stand may have seeded the group twice: either does.
  await page.getByRole('option', { name: 'E2E seed group' }).first().click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: m.studio_group_link_submit({}, ru) }).click()
  await expect(page.getByText(m.studio_group_linked({}, ru))).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: 'E2E seed group' }).first()
  await expect(card.getByText(/участник/)).toBeVisible()
  await card.getByRole('button', { name: m.studio_group_unlink({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: m.studio_group_unlink_title({ name: 'E2E seed group' }, ru) })
  await confirm.getByRole('button', { name: m.studio_group_unlink({}, ru) }).click()
  await expect(page.getByText(m.studio_group_unlinked({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_groups_empty({}, ru))).toBeVisible()
})

test('B-CST-15 team lists the creator with the role; applications stand apart', async ({ page, studio, seed }) => {
  // Only a course the student can see takes an application: a published one.
  const { course } = await studio.course({ chapters: [{ pages: [{ published: true }] }], publish: true })
  const teacher = cookieOf(seed, 'teacher')
  const body = { open_to_contributors: true }
  await updateCourse({ client: studio.api, path: { course_id: course.id }, body, headers: teacher, throwOnError: true })
  const student = cookieOf(seed, 'student')
  await applyContributor({ client: studio.api, path: { course_id: course.id }, headers: student, throwOnError: true })
  await page.goto(tab(course.id, 'team'))
  const team = page.getByRole('listitem').filter({ hasText: '@e2e-teacher' })
  await expect(team.getByText(m.studio_role_creator({}, ru))).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: m.studio_applications_title({}, ru) })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '@e2e-student1' })).toBeVisible()
})

test('B-CST-16 B-CST-17 co-authors are added by search with a role, re-roled and removed', async ({ page, studio }) => {
  const { course } = await studio.course()
  await page.goto(tab(course.id, 'team'))
  const picker = page.getByRole('combobox', { name: m.studio_team_people({}, ru) })
  await picker.fill('e2e-student2')
  await page.getByRole('option', { name: /@e2e-student2\)/ }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('combobox', { name: m.studio_role_label({}, ru) }).selectOption('reporter')
  await page.getByRole('button', { name: m.studio_team_add_submit({}, ru) }).click()
  await expect(page.getByText(m.studio_team_added({}, ru))).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: '@e2e-student2' })
  const role = row.getByRole('button', { name: /^Роль: / })
  await expect(role).toHaveText(m.studio_role_reporter({}, ru))
  await role.click()
  await page.getByRole('menuitemradio', { name: m.studio_role_maintainer({}, ru) }).click()
  await expect(page.getByText(m.studio_role_saved({}, ru))).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(role).toHaveText(m.studio_role_maintainer({}, ru))
  await row.getByRole('button', { name: m.studio_team_remove({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: /^Убрать «/ })
  await confirm.getByRole('button', { name: m.studio_team_remove({}, ru) }).click()
  await expect(page.getByText(m.studio_team_removed({}, ru))).toBeVisible()
  await expect(row).toHaveCount(0)
})

test('B-CST-18 an application is accepted into the team, or rejected after a confirmation', async ({
  page,
  studio,
  seed,
}) => {
  const teacher = cookieOf(seed, 'teacher')
  const student = cookieOf(seed, 'student')
  const open = async () => {
    const { course } = await studio.course({ chapters: [{ pages: [{ published: true }] }], publish: true })
    const body = { open_to_contributors: true }
    await updateCourse({
      client: studio.api,
      path: { course_id: course.id },
      body,
      headers: teacher,
      throwOnError: true,
    })
    await applyContributor({ client: studio.api, path: { course_id: course.id }, headers: student, throwOnError: true })
    return course
  }
  const accepted = await open()
  await page.goto(tab(accepted.id, 'team'))
  await page.getByRole('button', { name: m.studio_application_accept({}, ru) }).click()
  await expect(page.getByText(m.studio_application_accepted({}, ru))).toBeVisible()
  await expect(page.getByRole('heading', { name: m.studio_applications_title({}, ru) })).toHaveCount(0)
  const row = page.getByRole('listitem').filter({ hasText: '@e2e-student1' })
  await expect(row.getByRole('button', { name: /^Роль: / })).toHaveText(m.studio_role_contributor({}, ru))
  const rejected = await open()
  await page.goto(tab(rejected.id, 'team'))
  await page.getByRole('button', { name: m.studio_application_reject({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', { name: /^Отклонить заявку/ })
  await expect(confirm.getByText(m.studio_application_reject_consequence({}, ru))).toBeVisible()
  await confirm.getByRole('button', { name: m.studio_application_reject({}, ru) }).click()
  await expect(page.getByText(m.studio_application_rejected({}, ru))).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '@e2e-student1' })).toHaveCount(0)
})
