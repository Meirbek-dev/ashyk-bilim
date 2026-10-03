import { describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'

import { AnchoredListbox, type ListboxOption } from './anchored-listbox'
import { renderInRouter } from './testing'

const label = 'Insert block'
const options = [
  { value: 'heading', label: 'Heading' },
  { value: 'image', label: 'Image' },
  { value: 'table', label: 'Table' },
]
// The caret of an editor, as `view.coordsAtPos()` would give it.
const caret = { getBoundingClientRect: () => new DOMRect(40, 120, 0, 20) }

async function renderListbox() {
  const onSelect = vi.fn<(option: ListboxOption) => void>()
  const onOpenChange = vi.fn<(open: boolean) => void>()
  const screen = await renderInRouter(
    <AnchoredListbox
      label={label}
      options={options}
      anchor={caret}
      open
      onOpenChange={onOpenChange}
      onSelect={onSelect}
    />,
  )
  return { screen, onSelect, onOpenChange }
}

describe('AnchoredListbox', () => {
  test('opens under a virtual caret rect with focus in its search; typing filters, Enter picks and closes', async () => {
    const { screen, onSelect, onOpenChange } = await renderListbox()
    const search = screen.getByRole('combobox', { name: label })
    await expect.element(search).toHaveFocus()
    const popup = screen.getByRole('listbox').element().getBoundingClientRect()
    expect(Math.round(popup.top)).toBeGreaterThanOrEqual(140)
    expect(Math.abs(popup.left - 40)).toBeLessThanOrEqual(8)

    await userEvent.keyboard('ima')
    await expect.element(screen.getByRole('option', { name: 'Heading' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(options[1])
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  test('a search that matches nothing says so; Escape asks to close without a pick', async () => {
    const { screen, onSelect, onOpenChange } = await renderListbox()
    await expect.element(screen.getByRole('combobox', { name: label })).toHaveFocus()
    await userEvent.keyboard('zzz')
    await expect.element(screen.getByText(m.ui_options_empty())).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
