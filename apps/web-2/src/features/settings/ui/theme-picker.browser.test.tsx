import { describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { ThemeManifest } from '#/shared/api/themes'
import { renderInRouter } from '#/shared/components/testing'

import { ThemePicker } from './theme-picker'

const themes: ThemeManifest = Array.from({ length: 63 }, (_, index) => ({
  slug: `theme-${index}`,
  name: index === 30 ? 'Ocean Breeze' : `Theme ${index}`,
  preview: ['white', 'black', 'blue', 'purple'],
}))

describe('ThemePicker', () => {
  test('B-SET-11 on a phone the 63 themes scroll in a box that opens on the chosen one; search keeps the choice', async () => {
    const screen = await renderInRouter(
      <div className="w-96">
        <ThemePicker themes={themes} value="theme-62" onChange={vi.fn<(slug: string) => void>()} />
      </div>,
    )
    const group = screen.getByRole('radiogroup')
    await expect.element(screen.getByRole('radio', { name: 'Theme 62' })).toBeChecked()
    // The page stays short: the box scrolls, not the page, and it opened on the chosen theme at the end.
    const box = group.element()
    expect(box.clientHeight).toBeLessThanOrEqual(320)
    expect(box.scrollTop).toBeGreaterThan(0)
    await userEvent.fill(screen.getByRole('searchbox', { name: m.settings_theme_search() }).element(), 'ocean')
    await expect.poll(() => screen.getByRole('radio').elements().length).toBe(2)
    await expect.element(screen.getByRole('radio', { name: 'Ocean Breeze' })).toBeInTheDocument()
    await expect.element(screen.getByRole('radio', { name: 'Theme 62' })).toBeChecked()
  })
})
