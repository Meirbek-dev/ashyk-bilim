import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { Progress } from './progress'
import { renderInRouter } from './testing'

describe('Progress', () => {
  test('its value text is in the page language, not the browser one, so SSR and hydration agree', async () => {
    // The page speaks ru (the test default); this Chromium runs in en-US, which reads "42%".
    const screen = await renderInRouter(<Progress value={42} aria-label={m.ui_file_uploading()} />)
    await expect.element(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '42 %')
  })
})
