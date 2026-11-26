import { describe, expect, test } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'

import { renderInRouter } from '#/shared/components/testing'

import { Button } from './button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

const [bold, saveName, shortcut] = ['Bold', 'Save', 'Ctrl+S']

describe('Tooltip', () => {
  test('names an icon-only trigger on focus and hides on Escape', async () => {
    const screen = await renderInRouter(
      <Tooltip delay={0}>
        <TooltipTrigger render={<Button variant="ghost" size="icon" />}>
          <svg aria-hidden />
        </TooltipTrigger>
        <TooltipContent>{bold}</TooltipContent>
      </Tooltip>,
    )
    await userEvent.keyboard('{Tab}')
    await expect.element(page.getByRole('tooltip')).toHaveTextContent(bold)
    await expect.element(screen.getByRole('button', { name: bold })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
  })

  test('describes a trigger that already has a name', async () => {
    const screen = await renderInRouter(
      <Tooltip delay={0}>
        <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={saveName} />}>
          <svg aria-hidden />
        </TooltipTrigger>
        <TooltipContent>{shortcut}</TooltipContent>
      </Tooltip>,
    )
    await userEvent.keyboard('{Tab}')
    const save = screen.getByRole('button', { name: saveName })
    await expect.element(page.getByRole('tooltip')).toBeVisible()
    await expect.element(save).toHaveAccessibleDescription(shortcut)
  })
})
