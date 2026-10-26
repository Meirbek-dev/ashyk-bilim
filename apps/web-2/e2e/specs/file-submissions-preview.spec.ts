import { m } from '#/paraglide/messages'

import { expect, ru, test } from './file-submissions-fixture'

// Course staff on a learner's hand-in (B-FSB-25), kept apart from file-submissions.spec.ts (max-lines).

test('B-FSB-25 the course teacher opens the hand-in as a preview, an unpublished task too, and leaves to the studio', async ({
  page,
  signInAs,
  makeCourse,
  tasks,
}) => {
  const course = await makeCourse({ activities: 1 })
  const task = await tasks.make(course, { publish: false })
  await signInAs('teacher')
  await page.goto(`/learn/${course.id}/${task.activity_id}/submission`)
  await expect(page.getByRole('heading', { level: 1, name: 'Эссе' })).toBeVisible()
  await expect(page.getByText(m.player_preview_title({}, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: m.player_preview_studio({}, ru) })).toHaveAttribute(
    'href',
    `/teach/courses/${course.id}/activities/${task.activity_id}/edit`,
  )
})
