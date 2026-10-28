import { expect, test, vi } from 'vite-plus/test'

import { renderInRouter } from '#/shared/components/testing'

import { PublicSections } from './public-sections'

test('an item the owner entered twice shows twice on the public profile, without a duplicate-key warning', async () => {
  const error = vi.spyOn(console, 'error')
  const screen = await renderInRouter(
    <PublicSections
      sections={[
        { id: 's1', type: 'skills', title: 'Навыки', skills: [{ name: 'Python' }, { name: 'Python' }] },
        {
          id: 'l1',
          type: 'links',
          title: 'Ссылки',
          links: [
            { url: 'https://a.kz', title: 'Сайт' },
            { url: 'https://a.kz', title: 'Сайт' },
          ],
        },
      ]}
    />,
  )
  await expect
    .element(screen.getByRole('region', { name: 'Навыки' }).getByRole('listitem').nth(1))
    .toHaveTextContent('Python')
  await expect.element(screen.getByRole('region', { name: 'Ссылки' }).getByRole('listitem').nth(1)).toBeVisible()
  expect(error.mock.calls.flat().join(' ')).not.toContain('same key')
})
