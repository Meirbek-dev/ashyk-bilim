/** @vitest-environment jsdom */
// Critic 9 F16 nits: every discussion mutation toasts, delete asks first
// (AlertDialog), and the vote buttons are real toggles for assistive tech
// (`aria-pressed` + an accessible name).
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import DiscussionList from '@/components/discussions/discussion-list'
import type { Discussion } from '@services/courses/discussions'

const mocks = vi.hoisted(() => ({ toastSuccess: vi.fn(), deleteDiscussion: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ relativeTime: () => 'now' }),
  useNow: () => new Date(0),
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: vi.fn() } }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
vi.mock('@/components/Utils/PermissionTooltip', () => ({
  PermissionTooltip: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
vi.mock('@services/courses/discussions', () => ({
  createDiscussion: vi.fn(),
  deleteDiscussion: (...args: unknown[]) => mocks.deleteDiscussion(...args),
  toggleDiscussionDislike: vi.fn(),
  toggleDiscussionLike: vi.fn(),
  updateDiscussion: vi.fn(),
}))

const post: Discussion = {
  id: 'p1',
  discussion_uuid: 'p1',
  parent_id: null,
  course_id: 'c1',
  content: '<p>hi</p>',
  status: 'active',
  likes_count: 2,
  dislikes_count: 0,
  replies_count: 0,
  is_liked: true,
  is_disliked: false,
  is_owner: true,
  can_update: true,
  can_delete: true,
  can_moderate: false,
  created_at_unix: 1,
  updated_at_unix: 1,
  creation_date: '1970-01-01T00:00:01.000Z',
  update_date: '1970-01-01T00:00:01.000Z',
  type: 'post',
  user: { id: 'u', user_uuid: 'u', username: 'me', first_name: 'Me', last_name: '', email: '' },
  replies: [],
}

beforeEach(() => {
  mocks.toastSuccess.mockReset()
  mocks.deleteDiscussion.mockReset().mockResolvedValue(undefined)
})

function renderList() {
  return render(
    <DiscussionList
      initialPosts={[post]}
      currentUser={{ id: 'u', username: 'me' } as AppUserSummary}
      courseUuid="c1"
    />,
  )
}

describe('discussion mutation feedback', () => {
  it('asks before deleting, then deletes and toasts', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    // Nothing happens until the dialog is confirmed.
    expect(mocks.deleteDiscussion).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('confirmDeletePost')
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete' }))
    await waitFor(() => expect(mocks.deleteDiscussion).toHaveBeenCalledWith('c1', 'p1'))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('toasts.deleted'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('exposes the vote buttons as pressed toggles with names', () => {
    renderList()
    expect(screen.getByRole('button', { name: 'upvote' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'downvote' })).toHaveAttribute('aria-pressed', 'false')
  })
})

