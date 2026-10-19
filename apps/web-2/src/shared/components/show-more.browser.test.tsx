import { useState } from 'react'
import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'

import { ShowMore } from './show-more'
import { renderInRouter } from './testing'

function Harness() {
  const [pending, setPending] = useState(false)
  return <ShowMore hasMore pending={pending} onMore={() => setPending(true)} />
}

test('«Show more» keeps keyboard focus while the next page loads', async () => {
  const screen = await renderInRouter(<Harness />)
  const more = screen.getByRole('button', { name: m.ui_show_more() })
  await expect.element(more).toBeVisible()
  const button = more.element()
  if (!(button instanceof HTMLElement)) throw new Error('no button')
  button.focus()
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => button.getAttribute('aria-disabled')).toBe('true')
  expect(document.activeElement).toBe(button)
})
