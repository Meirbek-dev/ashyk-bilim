import { afterEach, describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { getLocale, setLocale } from '#/paraglide/runtime'

import { Progress } from './progress'
import { renderInRouter } from './testing'

const initial = getLocale()
afterEach(() => setLocale(initial, { reload: false }))

describe('Progress', () => {
  test('its value text is in the page language, not the browser one, so SSR and hydration agree', async () => {
    // The page speaks ru; this Chromium runs in en-US (CI), which reads "42%".
    await setLocale('ru', { reload: false })
    const screen = await renderInRouter(<Progress value={42} aria-label={m.ui_file_uploading()} />)
    await expect.element(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '42 %')
  })
})
