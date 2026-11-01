import { describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'
import type { Font } from '#/shared/lib/appearance'

import { FontPicker } from './font-picker'

describe('FontPicker', () => {
  test('each card is drawn in its own font set, whatever the page shows; a pick reports the set', async () => {
    const onChange = vi.fn<(font: Font) => void>()
    const screen = await renderInRouter(<FontPicker value="inter" onChange={onChange} />)
    await expect.element(screen.getByRole('radio', { name: 'Inter + Geologica' })).toBeChecked()
    const serif = screen.getByRole('radio', { name: 'Literata' })
    const card = serif.element().closest('label')
    expect(card && getComputedStyle(card).fontFamily).toContain('Literata Variable')
    // The page's own set (html[data-font]) does not leak into the cards.
    document.documentElement.dataset['font'] = 'geist'
    try {
      expect(getComputedStyle(document.body).fontFamily).toContain('Geist Variable')
      expect(card && getComputedStyle(card).fontFamily).toContain('Literata Variable')
    } finally {
      delete document.documentElement.dataset['font']
    }
    await userEvent.click(screen.getByRole('radio', { name: m.settings_font_system() }))
    expect(onChange).toHaveBeenLastCalledWith('system')
  })
})
