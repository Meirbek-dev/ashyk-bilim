/** @vitest-environment jsdom */
// Gauntlet: `updated_at` is bumped by a DB trigger on every row update (likes,
// reply counters), so it is not an edit signal — no "(edited)" marker from it.
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import DiscussionPost from '@/components/discussions/discussion-post'
import type { DiscussionPostData } from '@/components/discussions/types'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
vi.mock('@/components/Utils/PermissionTooltip', () => ({
  PermissionTooltip: ({ children }: { children: React.ReactNode }) => children,
}))

const post: DiscussionPostData = {
  id: 'p1',
  discussion_uuid: 'p1',
  username: 'other',
  firstName: 'Other',
  lastName: '',
  postMessage: '<p>hi</p>',
  createDate: '2026-09-11T10:00:00.000Z',
  // Bumped by a like — not an edit.
  updateDate: '2026-09-11T10:05:00.000Z',
  upvotes: 1,
  downvotes: 0,
  userVote: 'up',
  replies: [],
}

describe('DiscussionPost edited marker', () => {
  it('does not show "(Отредактировано)" just because updated_at moved', () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <DiscussionPost
          post={post}
          currentUser={{ id: 'me', username: 'me' } as AppUserSummary}
          onVotePost={() => {}}
          onVoteReply={() => {}}
          onDeletePost={() => {}}
          onDeleteReply={() => {}}
          onEditPost={() => {}}
          onEditReply={() => {}}
          onSubmitReply={() => {}}
        />
      </NextIntlClientProvider>,
    )
    expect(screen.queryByText(/Отредактировано/)).toBeNull()
  })
})
