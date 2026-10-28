import { useState } from 'react'
import { expect, test } from 'vite-plus/test'

import { renderInRouter } from '#/shared/components/testing'
import { Button } from '#/shared/ui/button'

import { useSwapFocus } from './use-swap-focus'

function Toggle() {
  const [on, setOn] = useState(false)
  const [renders, setRenders] = useState(0)
  const swap = useSwapFocus<'on' | 'off'>()
  const flip = (next: boolean) => {
    swap.mark(next ? 'on' : 'off')
    setOn(next)
  }
  return (
    <>
      {on ? (
        <div ref={swap.focusOn('on')}>
          <Button onClick={() => flip(false)}>Turn off</Button>
        </div>
      ) : (
        <div ref={swap.focusOn('off')}>
          <Button onClick={() => flip(true)}>Turn on</Button>
        </div>
      )}
      <Button onClick={() => setRenders(renders + 1)}>Elsewhere {renders}</Button>
    </>
  )
}

test('the control an action puts in place of another takes its focus, once', async () => {
  const screen = await renderInRouter(<Toggle />)
  await screen.getByRole('button', { name: 'Turn on' }).click()
  await expect.element(screen.getByRole('button', { name: 'Turn off' })).toHaveFocus()
  await screen.getByRole('button', { name: 'Turn off' }).click()
  await expect.element(screen.getByRole('button', { name: 'Turn on' })).toHaveFocus()
  // A later render (here: another control's state) leaves the focus where the user put it.
  await screen.getByRole('button', { name: /Elsewhere/ }).click()
  await expect.element(screen.getByRole('button', { name: 'Elsewhere 1' })).toHaveFocus()
})
