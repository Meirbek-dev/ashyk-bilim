import { m } from '#/paraglide/messages'

import { expect, test } from '../fixtures/seed'

const ru = { locale: 'ru' } as const

// The old create page's URL (legacy 301), apart from collections.spec.ts (its size cap).

test('B-COL-18 the old /collections/new opens the list with the create dialog; closing drops the parameter', async ({
  page,
  signInAs,
}) => {
  await signInAs('teacher')
  await page.goto('/ru/collections/new')
  await expect(page).toHaveURL(/\/collections\?create=true$/)
  const dialog = page.getByRole('dialog', { name: m.collections_new({}, ru) })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/collections$/)
})
