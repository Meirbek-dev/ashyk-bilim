import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useFormatter: () => ({}) }))

import { excerptOf, hrefFor } from '@components/Objects/Menus/NotificationBell'

const note = (payload: Record<string, unknown>) =>
  ({
    id: 'n',
    created_at_unix: 0,
    read_at_unix: null,
    payload: { course_id: 'c1', course_name: 'C', ...payload },
  }) as never

// A reply notification opened the top of the course page; the reply lives in the discussions far below.
describe('notification bell links', () => {
  it('opens the course discussions for a reply', () => {
    expect(hrefFor(note({ type: 'discussion_reply' }))).toBe('/course/c1#discussions')
  })
  it('keeps activity and course links', () => {
    expect(hrefFor(note({ type: 'grade_published', activity_id: 'a1' }))).toBe('/course/c1/activity/a1')
    expect(hrefFor(note({ type: 'course_update' }))).toBe('/course/c1')
  })
  it('opens the discussions for a new thread and the workspace (course page for an observer) for a team join', () => {
    expect(hrefFor(note({ type: 'discussion_post' }))).toBe('/course/c1#discussions')
    expect(hrefFor(note({ type: 'course_team_added', role: 'contributor' }))).toBe('/dash/courses/c1/curriculum')
    expect(hrefFor(note({ type: 'course_team_added', role: 'reporter' }))).toBe('/course/c1')
  })
  it('opens the review queue of the activity for work handed in to grade', () => {
    expect(hrefFor(note({ type: 'work_submitted', activity_id: 'a1' }))).toBe('/dash/courses/c1/activity/a1/review')
    expect(hrefFor(note({ type: 'remediation_assigned', activity_id: 'a1' }))).toBe('/course/c1/activity/a1')
  })
  it('quotes the post words of a reply or thread; older rows have none', () => {
    expect(excerptOf(note({ type: 'discussion_reply', excerpt: 'Срок завтра?' }))).toBe('«Срок завтра?»')
    expect(excerptOf(note({ type: 'discussion_post' }))).toBeNull()
  })
})
