import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Message, MessageContext, Person } from '#/shared/api/gen/types.gen'

import { buildFeed, contextTarget, contextText, denyText, excerpt, isAfter, lastMessageText, personName } from './feed'

const ME = '0190a5d2-0000-7000-8000-0000000000a1'
const PEER = '0190a5d2-0000-7000-8000-0000000000b1'
// 2026-03-02 10:00 at UTC+5.
const MORNING = 1_772_427_600

let serial = 0
const message = (user: string, at: number, extra: Partial<Message> = {}): Message => {
  serial += 1
  return {
    id: `0190a5d2-0000-7000-8000-${String(serial).padStart(12, '0')}`,
    conversation_id: '0190a5d2-0000-7000-8000-00000000c0c0',
    user_id: user,
    body: `text ${serial}`,
    created_at_unix: at,
    deleted: false,
    context: null,
    attachments: [],
    allowed_actions: [],
    ...extra,
  }
}

/** The server's pages: newest first. */
const pagesOf = (...oldestFirst: Message[]) => [oldestFirst.toReversed()]

describe('buildFeed', () => {
  test('oldest first, one header per run of an author within five minutes', () => {
    const a = message(PEER, MORNING)
    const b = message(PEER, MORNING + 60)
    const c = message(PEER, MORNING + 60 + 6 * 60)
    const d = message(ME, MORNING + 60 + 6 * 60 + 10)
    const rows = buildFeed({ pages: pagesOf(a, b, c, d), viewer: ME, lastRead: d.id, now: MORNING + 3600 })
    const messages = rows.filter(row => row.kind === 'message')
    expect(messages.map(row => row.message.id)).toEqual([a.id, b.id, c.id, d.id])
    expect(messages.map(row => row.header)).toEqual([true, false, true, true])
    expect(messages.map(row => row.own)).toEqual([false, false, false, true])
  })

  test('a divider for every day, today and yesterday by name', () => {
    const before = message(PEER, MORNING - 2 * 86_400)
    const yesterday = message(PEER, MORNING - 86_400)
    const today = message(PEER, MORNING)
    const rows = buildFeed({
      pages: pagesOf(before, yesterday, today),
      viewer: ME,
      lastRead: today.id,
      now: MORNING + 60,
    })
    const days = rows.filter(row => row.kind === 'day').map(row => row.label)
    expect(days).toHaveLength(3)
    expect(days.slice(1)).toEqual([m.conversations_yesterday(), m.conversations_today()])
  })

  test('"New messages" stands before the first unread message of the other person, once', () => {
    const read = message(PEER, MORNING)
    const mine = message(ME, MORNING + 10)
    const fresh = message(PEER, MORNING + 20)
    const fresher = message(PEER, MORNING + 30)
    const rows = buildFeed({ pages: pagesOf(read, mine, fresh, fresher), viewer: ME, lastRead: read.id, now: MORNING })
    const index = rows.findIndex(row => row.kind === 'new')
    expect(rows.filter(row => row.kind === 'new')).toHaveLength(1)
    expect(rows[index + 1]).toMatchObject({ kind: 'message', message: { id: fresh.id }, header: true })
  })

  test('nothing read yet: the divider goes before the first message from them; all read: none', () => {
    const first = message(PEER, MORNING)
    expect(buildFeed({ pages: pagesOf(first), viewer: ME, lastRead: null, now: MORNING })[1]).toMatchObject({
      kind: 'new',
    })
    expect(
      buildFeed({ pages: pagesOf(first), viewer: ME, lastRead: first.id, now: MORNING }).some(
        row => row.kind === 'new',
      ),
    ).toBe(false)
  })

  test('pages join in order: an older page comes before a newer one', () => {
    const old = message(PEER, MORNING)
    const recent = message(PEER, MORNING + 10)
    const rows = buildFeed({ pages: [[recent], [old]], viewer: ME, lastRead: recent.id, now: MORNING })
    expect(rows.filter(row => row.kind === 'message').map(row => row.message.id)).toEqual([old.id, recent.id])
  })
})

describe('labels', () => {
  const person: Person = {
    id: PEER,
    username: 'teacher.a',
    display_name: 'Teacher A',
    avatar_key: null,
    available: true,
  }

  test('a name falls back to the username; a gone account reads "Deleted user"', () => {
    expect(personName(person)).toBe('Teacher A')
    expect(personName({ ...person, display_name: '  ' })).toBe('teacher.a')
    expect(personName({ ...person, available: false })).toBe(m.conversations_unavailable_person())
  })

  test("the list preview marks one's own and deleted messages", () => {
    const last = { id: PEER, user_id: ME, excerpt: 'Hello', created_at_unix: MORNING, deleted: false, files: 0 }
    expect(lastMessageText(last, ME)).toBe(m.conversations_you_said({ text: 'Hello' }))
    expect(lastMessageText({ ...last, user_id: PEER }, ME)).toBe('Hello')
    expect(lastMessageText({ ...last, deleted: true }, ME)).toBe(m.conversations_deleted())
    expect(lastMessageText(null, ME)).toBe(m.conversations_no_messages())
    // Files alone stand for the text.
    expect(lastMessageText({ ...last, user_id: PEER, excerpt: '', files: 2 }, ME)).toBe(
      m.conversations_files_count({ count: 2 }),
    )
  })

  test('every deny reason has its line', () => {
    expect(denyText.no_relation()).toBe(m.conversations_deny_no_relation())
    expect(denyText.banned()).toBe(m.conversations_deny_banned())
    expect(denyText.peer_unavailable()).toBe(m.conversations_deny_peer_unavailable())
  })

  test('the context line leads to the activity when there is one, else to the course', () => {
    const course: MessageContext = {
      course_id: '0190a5d2-0000-7000-8000-0000000000c1',
      course_name: 'Algebra',
      activity_id: null,
      activity_name: null,
      activity_type: null,
    }
    expect(contextTarget(course)).toMatchObject({ to: '/courses/$courseId' })
    expect(contextText(course)).toBe(m.conversations_context_course({ course: 'Algebra' }))
    expect(contextText({ ...course, course_name: null })).toBe(m.conversations_context_course_hidden())
    const activity = { ...course, activity_id: '0190a5d2-0000-7000-8000-0000000000e1', activity_name: 'Quiz 1' }
    expect(contextTarget(activity)).toMatchObject({ to: '/learn/$courseId/$activityId' })
    expect(contextText(activity)).toBe(m.conversations_context_activity({ activity: 'Quiz 1' }))
  })

  test('ids compare in the order they were written; an excerpt is one short line', () => {
    expect(isAfter('0190a5d2-0000-7000-8000-000000000002', '0190a5d2-0000-7000-8000-000000000001')).toBe(true)
    expect(isAfter('0190a5d2-0000-7000-8000-000000000001', null)).toBe(true)
    expect(excerpt('a\n\n  b')).toBe('a b')
    expect(excerpt('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})
