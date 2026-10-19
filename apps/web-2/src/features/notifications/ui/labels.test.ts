import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { notificationLines } from './labels'

const names = { course_id: '0190a5d2-0000-7000-8000-000000000001', course_name: 'Алгебра' }
const people = { author_id: '0190a5d2-0000-7000-8000-000000000014', author_name: 'Аня' }
const thread = '0190a5d2-0000-7000-8000-000000000012'

test('B-NOT-04 a reply and a new thread carry the post words as their second line; an old row without them has one', () => {
  const reply = {
    ...names,
    ...people,
    type: 'discussion_reply' as const,
    discussion_id: thread,
    reply_id: '0190a5d2-0000-7000-8000-000000000013',
  }
  expect(notificationLines({ ...reply, excerpt: 'Срок завтра?' })).toEqual([
    m.notifications_text_reply({ author: 'Аня', course: 'Алгебра' }),
    m.notifications_text_excerpt({ text: 'Срок завтра?' }),
  ])
  expect(notificationLines(reply)).toHaveLength(1)
  const post = { ...names, ...people, type: 'discussion_post' as const, discussion_id: thread, excerpt: 'Вопрос' }
  expect(notificationLines(post)[1]).toBe(m.notifications_text_excerpt({ text: 'Вопрос' }))
})
