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
  expect(notificationLines(reply, 3)[0]).toBe(m.notifications_text_replies({ count: 3, course: 'Алгебра' }))
  const post = { ...names, ...people, type: 'discussion_post' as const, discussion_id: thread, excerpt: 'Вопрос' }
  expect(notificationLines(post)[1]).toBe(m.notifications_text_excerpt({ text: 'Вопрос' }))
})

test('B-NOT-04 a released or returned work quotes the teacher feedback; an old row without it does not', () => {
  const work = {
    ...names,
    activity_id: '0190a5d2-0000-7000-8000-000000000021',
    activity_name: 'Эссе',
    submission_id: null,
    attempt_id: null,
    activity_type: 'quiz' as const,
  }
  const what = m.notifications_text_activity({ activity: 'Эссе', course: 'Алгебра' })
  const quote = m.notifications_text_excerpt({ text: 'Добавьте пример' })
  expect(
    notificationLines({ ...work, type: 'grade_published', final_score: 90, excerpt: 'Добавьте пример' })[1],
  ).toContain(quote)
  expect(notificationLines({ ...work, type: 'submission_returned', excerpt: 'Добавьте пример' })).toEqual([what, quote])
  expect(notificationLines({ ...work, type: 'submission_returned' })).toEqual([what])
})

test('B-NOT-18 a hand-in row names the activity, then who handed in, or how many and who last', () => {
  const payload = {
    ...names,
    type: 'work_submitted' as const,
    activity_id: '0190a5d2-0000-7000-8000-00000000000a',
    activity_name: 'Эссе',
    activity_type: 'file_submission' as const,
    learner_id: '0190a5d2-0000-7000-8000-000000000015',
    learner_name: 'Аня',
    submission_id: null,
    attempt_id: null,
    count: 1,
  }
  expect(notificationLines(payload)).toEqual([
    m.notifications_text_activity({ activity: 'Эссе', course: 'Алгебра' }),
    'Аня: работа ждёт проверки',
  ])
  expect(notificationLines({ ...payload, count: 3 })[1]).toBe('3 новые работы ждут проверки, последняя — Аня')
  expect(notificationLines({ ...payload, count: 5 })[1]).toBe('5 новых работ ждут проверки, последняя — Аня')
})

test('B-NOT-19 a mistake review says whether it blocks the next attempt', () => {
  const payload = {
    ...names,
    type: 'remediation_assigned' as const,
    activity_id: '0190a5d2-0000-7000-8000-00000000000a',
    activity_name: 'Тест',
    activity_type: 'quiz' as const,
    session_id: '0190a5d2-0000-7000-8000-000000000016',
    gate: true,
  }
  expect(notificationLines(payload)[1]).toBe(m.notifications_text_remediation_gate())
  expect(notificationLines({ ...payload, gate: false })[1]).toBe(m.notifications_text_remediation())
})
