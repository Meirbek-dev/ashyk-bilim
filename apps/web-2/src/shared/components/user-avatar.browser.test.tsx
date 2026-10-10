import { describe, expect, test } from 'vite-plus/test'

import { renderInRouter } from './testing'
import { UserAvatar } from './user-avatar'

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
})
