import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'

import { renderInRouter } from '#/shared/components/testing'

import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu'

const text = { trigger: 'Actions', rename: 'Rename', duplicate: 'Duplicate', home: 'Home', move: 'Move to', up: 'Up' }
const [newest, oldest] = ['new', 'old']

function Actions({ onRename, onDuplicate, onHome }: Record<'onRename' | 'onDuplicate' | 'onHome', () => void>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline">{text.trigger}</Button>} />
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onRename}>{text.rename}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>{text.duplicate}</DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/" onClick={onHome} />}>{text.home}</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{text.move}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>{text.up}</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

async function renderActions() {
  const spies = { onRename: vi.fn<() => void>(), onDuplicate: vi.fn<() => void>(), onHome: vi.fn<() => void>() }
  const screen = await renderInRouter(<Actions {...spies} />)
  return { screen, trigger: screen.getByRole('button', { name: text.trigger }), ...spies }
}

function Sort() {
  const [value, setValue] = useState(newest)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline">{value}</Button>} />
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={value} onValueChange={setValue}>
          <DropdownMenuRadioItem value={newest}>{newest}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value={oldest} closeOnSelect>
            {oldest}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const highlighted = () => document.querySelector('[data-slot="menu-content"]:not([data-nested]) [data-highlighted]')

describe('DropdownMenu', () => {
  test('arrows and typeahead move the highlight, Enter runs the item, closes and returns focus to the trigger', async () => {
    const { trigger, onRename, onDuplicate } = await renderActions()
    await trigger.click()
    await expect.element(page.getByRole('menu')).toBeVisible()
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(() => highlighted()?.textContent).toBe(text.rename)
    await userEvent.keyboard('d')
    await expect.poll(() => highlighted()?.textContent).toBe(text.duplicate)
    await userEvent.keyboard('{Enter}')
    expect(onDuplicate).toHaveBeenCalledOnce()
    expect(onRename).not.toHaveBeenCalled()
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
  })

  test('an item rendered as a router link is a menu item that Enter follows', async () => {
    const { trigger, onHome } = await renderActions()
    await trigger.click()
    const home = page.getByRole('menuitem', { name: text.home })
    await expect.element(home).toHaveAttribute('href', '/')
    await userEvent.keyboard('h')
    await expect.poll(() => highlighted()?.textContent).toBe(text.home)
    await userEvent.keyboard('{Enter}')
    expect(onHome).toHaveBeenCalledOnce()
  })

  test('ArrowRight opens a submenu, Escape closes only it and returns to its trigger, then the menu', async () => {
    const { trigger } = await renderActions()
    await trigger.click()
    await userEvent.keyboard('m{ArrowRight}')
    await expect.element(page.getByRole('menuitem', { name: text.up })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('menuitem', { name: text.up })).not.toBeInTheDocument()
    await expect.element(page.getByRole('menuitem', { name: text.move })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
  })

  test('radio items check one value', async () => {
    const screen = await renderInRouter(<Sort />)
    await screen.getByRole('button', { name: newest }).click()
    await expect.element(page.getByRole('menuitemradio', { name: newest })).toBeChecked()
    await page.getByRole('menuitemradio', { name: oldest }).click()
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: oldest })).toBeVisible()
  })
})
