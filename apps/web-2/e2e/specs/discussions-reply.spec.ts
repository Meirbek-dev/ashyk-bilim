import { m } from '#/paraglide/messages'

import { expect } from '../fixtures/seed'
import { article, tab, test } from './discussions-fixture'

const ru = { locale: 'ru' } as const

test('B-DSC-20 «Ответить» on a post without replies puts the cursor in the reply', async ({
  page,
  signInAs,
  course,
  post,
}) => {
  const made = await course()
  await post(made, 'Вопрос без ответов.', 'teacher')
  await signInAs('student')
  await page.goto(tab(made))
  await article(page, 'Вопрос без ответов.')
    .getByRole('link', { name: m.discussions_reply({}, ru) })
    .click()
  await expect(
    page.getByRole('region', { name: m.discussions_replies({ count: 0 }, ru) }).getByRole('textbox'),
  ).toBeFocused({ timeout: 15_000 }) // the editor chunk loads on demand
})
