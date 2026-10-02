import { m } from '#/paraglide/messages'

import { expect, test } from '../fixtures/test'

const ru = { locale: 'ru' } as const

test(
  'B-COL-01 a guest gets the collections list in the server-rendered document',
  { tag: '@smoke' },
  async ({ page }) => {
    const document = await page.request.get('/collections')
    expect(await document.text()).toContain(m.collections_title({}, ru))

    await page.goto('/collections')
    await expect(page.getByRole('heading', { name: m.collections_title({}, ru) })).toBeVisible()
  },
)
