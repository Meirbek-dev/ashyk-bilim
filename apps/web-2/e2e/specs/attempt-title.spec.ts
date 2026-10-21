import { m } from '#/paraglide/messages'

import { gotoLive } from '../fixtures/test'
import { expect, ru, test } from './attempt-fixture'

test('B-ATT-28 the test page is named like the activity the learner clicked, not the test’s own title', async ({
  page,
  learner,
  makeQuiz,
}) => {
  const quiz = await makeQuiz()
  await learner.enroll(quiz.course)
  await learner.signIn()
  const activityId = quiz.course.activityIds.at(-1) ?? ''
  await gotoLive(page, `/learn/${quiz.course.id}/${activityId}`)
  const name = await page.getByRole('heading', { level: 1 }).innerText()
  // Imported tests often carry a title of their own (on prod about half: a topic), apart from the activity's name.
  await page.route('**/api/v2/activities/*/assessment', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), title: 'Эмоциональный брендинг' } })
  })
  await page.getByRole('link', { name: m.player_entry_start({}, ru) }).click()
  await expect(page).toHaveURL(quiz.url)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText('Эмоциональный брендинг')).toHaveCount(0)
})
