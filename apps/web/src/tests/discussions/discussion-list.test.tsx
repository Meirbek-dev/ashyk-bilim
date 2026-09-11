/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DiscussionList from '@/components/discussions/discussion-list'
import type { Discussion } from '@services/courses/discussions'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ relativeTime: () => 'now' }),
  useNow: () => new Date(0),
}))
vi.mock('next/dynamic', () => ({
  default: () => (props: { content: string; onChange: (value: string) => void }) => (
    <textarea data-testid="editor" value={props.content} onChange={event => props.onChange(event.target.value)} />
  ),
}))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
vi.mock('@/components/Utils/PermissionTooltip', () => ({
  PermissionTooltip: ({ children }: { children: React.ReactNode }) => children,
}))
const toastApiError = vi.fn()
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError }) }))
const createDiscussion = vi.fn()
vi.mock('@services/courses/discussions', () => ({
  createDiscussion: (...args: unknown[]) => createDiscussion(...args),
  deleteDiscussion: vi.fn(),
  toggleDiscussionDislike: vi.fn(),
  toggleDiscussionLike: vi.fn(),
  updateDiscussion: vi.fn(),
}))

const courseId = '01a0910d-2963-7483-a97d-40dc56e9aa20'
const base = {
  course_id: courseId,
  content: '<p>hi</p>',
  status: 'active' as const,
  likes_count: 0,
  dislikes_count: 0,
  replies_count: 0,
  is_liked: false,
  is_disliked: false,
  is_owner: false,
  can_update: false,
  can_delete: false,
  can_moderate: false,
  created_at_unix: 1,
  updated_at_unix: 1,
  creation_date: '1970-01-01T00:00:01.000Z',
  update_date: '1970-01-01T00:00:01.000Z',
  type: 'post' as const,
  user: { id: 'u', user_uuid: 'u', username: 'other', first_name: 'Other', last_name: '', email: '' },
}
const reply: Discussion = { ...base, id: 'r1', discussion_uuid: 'r1', parent_id: 'p1', type: 'reply', replies: [] }
const post: Discussion = { ...base, id: 'p1', discussion_uuid: 'p1', parent_id: null, replies: [reply] }

beforeEach(() => vi.clearAllMocks())

describe('DiscussionList (v2)', () => {
  it('derives reply actions from the wire can_update/can_delete instead of the viewer username', () => {
    const trashButtons = () => document.querySelectorAll('button:has(svg.lucide-trash)')
    // Same username as the author, but the server says the viewer may not touch it.
    const first = render(<DiscussionList initialPosts={[post]} currentUser={{ username: 'other' }} courseUuid={courseId} />)
    expect(trashButtons()).toHaveLength(0)
    first.unmount()

    const editable: Discussion = { ...post, replies: [{ ...reply, can_delete: true, can_update: true }] }
    render(<DiscussionList initialPosts={[editable]} currentUser={{ username: 'nobody' }} courseUuid={courseId} />)
    expect(trashButtons()).toHaveLength(1)
  })

  it('surfaces a failed post through the localized API error toast', async () => {
    createDiscussion.mockRejectedValueOnce(new Error('boom'))
    render(<DiscussionList initialPosts={[]} currentUser={{ username: 'me' }} courseUuid={courseId} />)
    fireEvent.change(screen.getAllByTestId('editor')[0]!, { target: { value: '<p>new post</p>' } })
    fireEvent.click(screen.getByText('postDiscussion'))
    await waitFor(() => expect(toastApiError).toHaveBeenCalledWith(expect.any(Error), { fallback: 'errors.createFailed' }))
    expect(createDiscussion).toHaveBeenCalledWith(courseId, { content: '<p>new post</p>', type: 'post' })
  })
})
