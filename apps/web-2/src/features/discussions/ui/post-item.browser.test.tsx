import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Discussion } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { PostItem } from './post-item'

// What the API sends for a post deleted after others replied (owner decision 2026-10-14).
const tombstone: Discussion = {
  id: '0190a5d2-0000-7000-8000-000000000021',
  course_id: '0190a5d2-0000-7000-8000-000000000022',
  parent_id: null,
  content: '',
  status: 'deleted',
  version: 3,
  author: null,
  likes_count: 0,
  dislikes_count: 0,
  replies_count: 2,
  is_liked: false,
  is_disliked: false,
  replies: [],
  is_owner: false,
  can_update: false,
  can_delete: false,
  can_moderate: false,
  allowed_actions: [],
  parent_replies_count: null,
  created_at_unix: 1_791_919_800,
  updated_at_unix: 1_791_919_800,
}

describe('PostItem', () => {
  test('a tombstone shows «Сообщение удалено», no author, no actions, and still opens its replies', async () => {
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <PostItem item={tombstone} />
      </QueryClientProvider>,
    )
    await expect.element(screen.getByText(m.discussions_post_deleted())).toBeVisible()
    await expect.element(screen.getByText(m.discussions_unknown_author())).not.toBeInTheDocument()
    await expect.element(screen.getByRole('link', { name: m.discussions_replies({ count: 2 }) })).toBeVisible()
    await expect.element(screen.getByRole('button')).not.toBeInTheDocument()
  })

  test('B-DSC-08 a moderator opens the replies of a hidden post', async () => {
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <PostItem item={{ ...tombstone, status: 'hidden', content: 'x', allowed_actions: ['moderate'] }} />
      </QueryClientProvider>,
    )
    await expect.element(screen.getByRole('link', { name: m.discussions_replies({ count: 2 }) })).toBeVisible()
  })

  test('B-DSC-08 the owner of a hidden post without moderate gets no replies link', async () => {
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <PostItem item={{ ...tombstone, status: 'hidden', content: 'x', allowed_actions: ['update'] }} />
      </QueryClientProvider>,
    )
    await expect.element(screen.getByText(m.discussions_hidden())).toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: m.discussions_replies({ count: 2 }) }))
      .not.toBeInTheDocument()
  })
})
