import { useState } from 'react'
import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { Input } from '#/shared/ui/input'

import { SubmitButton } from './submit-button'
import { renderInRouter } from './testing'

const [send, field] = ['Send', 'Field']

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const [pending, setPending] = useState(false)
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    onSubmit()
    setPending(true)
  }
  return (
    <form onSubmit={submit}>
      <Input aria-label={field} />
      <SubmitButton type="submit" pending={pending}>
        {send}
      </SubmitButton>
    </form>
  )
}

test('a pending SubmitButton keeps keyboard focus, says it is busy and does not send twice', async () => {
  let sent = 0
  const screen = await renderInRouter(<Harness onSubmit={() => (sent += 1)} />)
  const button = screen.getByRole('button', { name: send })
  await expect.element(button).toBeVisible()
  const element = button.element()
  if (!(element instanceof HTMLElement)) throw new Error('no button')
  element.focus()
  await userEvent.keyboard('{Enter}')
  await expect.element(button).toHaveAttribute('aria-busy', 'true')
  expect(element.getAttribute('aria-disabled')).toBe('true')
  expect(document.activeElement).toBe(element)
  await userEvent.keyboard('{Enter}')
  await userEvent.click(screen.getByRole('textbox', { name: field }))
  await userEvent.keyboard('{Enter}')
  expect(sent).toBe(1)
})
