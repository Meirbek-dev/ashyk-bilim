import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'

import { expect, items, type MadeQuiz, ru, test } from './attempt-fixture'

// One attempt open in two tabs (or a reload, or another device): what a tab shows and sends (slice 5.2, R-08).

test.describe.configure({ timeout: 90_000 })

const status = (page: Page) => page.getByRole('banner').locator('output')

async function start(page: Page, quiz: MadeQuiz) {
  await page.goto(quiz.url)
  await page.getByRole('button', { name: m.attempt_start({}, ru) }).click()
  await expect(page).toHaveURL(/[?&]attempt=/)
}

test('B-ATT-16 «Сдать» in a tab that missed another tab’s answer shows that answer before handing in', async ({
  page,
  context,
  learner,
  makeQuiz,
}) => {
  const quiz = await makeQuiz({ questions: [items.single] })
  await learner.enroll(quiz.course)
  await learner.signIn()
  await start(page, quiz)
  await page.getByRole('radio', { name: 'Астана' }).check()
  await expect(status(page)).toHaveText(m.attempt_saved({}, ru), { timeout: 20_000 })
  // A saved answer leaves nothing in the stored queue for another tab (or a reload) to adopt and send again.
  await expect
    .poll(async () =>
      (await context.storageState()).origins
        .flatMap(origin => origin.localStorage)
        .map(entry => entry.name)
        .filter(name => name.startsWith('ab.attempt.')),
    )
    .toEqual([])
  const other = await context.newPage()
  // The other tab misses the live event of the first tab's save (another device offline, a dropped stream).
  await other.route('**/api/v2/me/events', route => route.abort())
  await other.goto(page.url())
  await expect(other.getByRole('radio', { name: 'Астана' })).toBeChecked()
  // The first tab changes the answer; the other one still shows the old one.
  await page.getByRole('radio', { name: 'Алматы' }).check()
  await expect(status(page)).toHaveText(m.attempt_saved({}, ru), { timeout: 20_000 })
  await expect(other.getByRole('radio', { name: 'Астана' })).toBeChecked()
  await other.getByRole('button', { name: m.attempt_submit({}, ru) }).click()
  await expect(other.getByRole('radio', { name: 'Алматы', includeHidden: true }).first()).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await other.close()
})
