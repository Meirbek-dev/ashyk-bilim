import { m } from '#/paraglide/messages'

import { expect, test } from '../fixtures/learning'

const ru = { locale: 'ru' } as const

test.use({ viewport: { width: 390, height: 760 } })

// ROUND3 decision 23: on a phone the «Отмечено» / «+N XP» toasts come in at the top, never over the action row.
test('B-PLY-06 on a phone the «Отмечено» toast stays clear of the player action row', async ({
  page,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 2 })
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(`/learn/${course.id}/${course.activityIds[0]}`)
  await page.getByRole('button', { name: m.player_mark({}, ru) }).click()
  const toast = page.locator('[data-slot="toast"]').filter({ hasText: m.player_marked({}, ru) })
  await expect(toast).toBeVisible()
  const action = page.getByRole('link', { name: m.player_next_step({ title: '' }, ru).trim() })
  const [toastBox, actionBox] = [await toast.boundingBox(), await action.boundingBox()]
  expect(toastBox && actionBox && toastBox.y + toastBox.height <= actionBox.y).toBe(true)
  expect(toastBox?.y).toBeLessThan(100)
})
