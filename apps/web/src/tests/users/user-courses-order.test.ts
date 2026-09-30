import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))
vi.mock('@/hooks/courses/courseKeys', () => ({ toAppCourse: (c: { id: string }) => c.id }))

import { apiJson } from '@/lib/api-client'
import { getCoursesByUser } from '@/lib/users/client'

// UX-234: profile cards show the update date, so they are listed by it (the API pages by id).
describe('getCoursesByUser', () => {
  it('lists the last updated course first', async () => {
    vi.mocked(apiJson).mockResolvedValue({
      items: [
        { id: 'new-stale', updated_at_unix: 100 },
        { id: 'old-fresh', updated_at_unix: 300 },
        { id: 'mid', updated_at_unix: 200 },
      ],
      next_cursor: null,
    })
    await expect(getCoursesByUser('teacher')).resolves.toEqual(['old-fresh', 'mid', 'new-stale'])
  })
})
