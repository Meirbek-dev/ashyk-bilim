import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { renderInRouter } from '#/shared/components/testing'
import { Resizable, ResizableHandle, ResizablePanel } from '#/shared/ui/resizable'

const name = 'Resize files'
const [first, second] = ['Files', 'Editor']

test('a handle is a named separator that the arrows move and that commits once per key', async () => {
  const commits: number[][] = []
  const screen = await renderInRouter(
    <div className="h-60 w-96">
      <Resizable step={10} onLayoutCommit={layout => commits.push(layout.map(Math.round))}>
        <ResizablePanel defaultSize={40} minSize={20}>
          {first}
        </ResizablePanel>
        <ResizableHandle aria-label={name} />
        <ResizablePanel minSize={20}>{second}</ResizablePanel>
      </Resizable>
    </div>,
  )
  const handle = screen.getByRole('separator', { name })
  await expect.element(handle).toHaveAttribute('aria-valuenow', '40')
  handle.element().focus()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(handle).toHaveAttribute('aria-valuenow', '50')
  await userEvent.keyboard('{Home}')
  await expect.element(handle).toHaveAttribute('aria-valuenow', '20')
  expect(commits).toEqual([
    [50, 50],
    [20, 80],
  ])
})

test('a panel is flush: web.css padding is off', async () => {
  const screen = await renderInRouter(
    <div className="h-60 w-96">
      <Resizable orientation="vertical">
        <ResizablePanel>{first}</ResizablePanel>
        <ResizableHandle aria-label={name} />
        <ResizablePanel>{second}</ResizablePanel>
      </Resizable>
    </div>,
  )
  await expect.element(screen.getByRole('separator', { name })).toHaveAttribute('aria-orientation', 'horizontal')
  expect(getComputedStyle(screen.getByText(first).element()).paddingTop).toBe('0px')
})
