import { describe, expect, test } from 'vite-plus/test'

import { renderInRouter } from './testing'
import { UserAvatar } from './user-avatar'

const requested = (path: string) =>
  performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname === path)

describe('UserAvatar', () => {
  test('without a photo, or while it fails to load, the initials', async () => {
    const screen = await renderInRouter(
      <>
        <UserAvatar name="Айгерим Сапарова" avatarKey="avatar/missing" />
        <UserAvatar name="Bolat" />
      </>,
    )
    // The test server has no such object: a photo that fails to load keeps the initials.
    await expect.element(screen.getByText('АС')).toBeInTheDocument()
    await expect.element(screen.getByText('B')).toBeInTheDocument()
  })

  test('the preview at the drawn size first, the original while it is missing', async () => {
    await renderInRouter(<UserAvatar name="Dana" avatarKey="avatar/fresh" />)
    // 32 px at density 1: the 64 px preview; it is not there, so the original is asked for next.
    await expect.poll(() => requested('/content/avatar/fresh')).toBe(true)
    expect(requested('/content/avatar/fresh.w64')).toBe(true)
  })
})
