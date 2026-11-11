import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { MAX_RECIPIENTS } from './attachments'
import { bulkSummary, initialPicks, toggle } from './bulk'

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `P${i}` }))

describe('bulk send', () => {
  test('everyone shown is ticked, up to the limit', () => {
    expect(initialPicks(people(3)).size).toBe(3)
    expect(initialPicks(people(70)).size).toBe(MAX_RECIPIENTS)
  })

  test('a tick past the limit does nothing; an untick frees a place', () => {
    const full = initialPicks(people(70))
    expect(toggle(full, 'u60').has('u60')).toBe(false)
    const freed = toggle(full, 'u0')
    expect(freed.has('u0')).toBe(false)
    expect(toggle(freed, 'u60').has('u60')).toBe(true)
  })

  test('the summary names who could not be written to', () => {
    const sent = [{ user_id: 'a', conversation_id: 'c', message_id: 'm' }]
    expect(bulkSummary({ sent, skipped: [] })).toBe(m.conversations_bulk_sent({ count: 1 }))
    expect(bulkSummary({ sent, skipped: [{ user_id: 'b', reason: 'peer_unavailable' }] })).toContain(
      m.conversations_bulk_skipped({ count: 1 }),
    )
  })
})
