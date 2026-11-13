import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { ItemPicture } from './item-picture'

const picture = { upload_id: 'u1', width: 40, height: 20, alt: 'Код' }
// A 1x1 transparent GIF: a picture that loads.
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

describe('ItemPicture', () => {
  test('a picture that keeps failing retries with a fresh URL, then says so and offers a retry', async () => {
    const screen = await renderInRouter(<ItemPicture picture={picture} url="/__missing__.png" zoom={false} />)
    await expect.element(screen.getByText(m.ui_picture_failed(), { exact: false })).toBeVisible()
    // The fallback keeps the picture's name for a screen reader.
    await expect.element(screen.getByText('Код:')).toBeInTheDocument()
    await screen.getByRole('button', { name: m.ui_retry() }).click()
    // One more load (a 404 again here): the picture comes back to the same fallback, not a broken image.
    await expect.element(screen.getByRole('button', { name: m.ui_retry() })).toBeVisible()
  })

  test('a click opens the picture full size in a dialog', async () => {
    const screen = await renderInRouter(<ItemPicture picture={picture} url={PIXEL} zoom />)
    await screen.getByRole('button', { name: m.ui_picture_zoom() }).click()
    const dialog = screen.getByRole('dialog')
    await expect.element(dialog.getByRole('img', { name: 'Код' })).toHaveAttribute('src', PIXEL)
  })
})
