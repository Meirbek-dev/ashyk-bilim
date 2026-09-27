import { describe, expect, it } from 'vite-plus/test'

import { collectPages } from '@/lib/api/contract'

// BUG-352 (audit AUD-016): the walk stopped after 20 pages without saying
// so — «all members» selectors lost everyone past 2 000.
describe('collectPages', () => {
  it('follows every cursor to the end', async () => {
    const items = await collectPages(async cursor => {
      const index = cursor ? Number(cursor) : 0
      return { items: [index], next_cursor: index < 24 ? String(index + 1) : null }
    })
    expect(items).toHaveLength(25)
  })

  it('refuses a cursor loop instead of truncating', async () => {
    await expect(
      collectPages(async cursor => ({ items: [cursor], next_cursor: cursor === 'b' ? 'a' : cursor ? 'b' : 'a' })),
    ).rejects.toThrow(/repeated cursor a/)
  })
})
