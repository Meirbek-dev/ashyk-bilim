import { beforeEach, expect, test } from 'vite-plus/test'

import { eventClientTime, noteServerDate, noteStreamEvent, readMayPredate, resetServerClock } from './server-clock'

const SECOND = 1_700_000_000
const MS = SECOND * 1000
const event = (appended: number | string, sentAt = SECOND) => ({ event_id: `${appended}-0`, sent_at: sentAt })

beforeEach(resetServerClock)

test('B-NOT-14 an event is timed by its append through the stream offset, the tightest arrival so far', () => {
  // The server clock runs 5 s behind the tab; events arrive 40 ms and then 5 ms after their append.
  noteStreamEvent(event(MS + 100), MS + 100 + 5000 + 40)
  expect(eventClientTime(event(MS + 100))).toBe(MS + 100 + 5000 + 40)
  noteStreamEvent(event(MS + 300), MS + 300 + 5000 + 5)
  expect(eventClientTime(event(MS + 420))).toBe(MS + 420 + 5000 + 5)
})

test('B-NOT-14 an id that disagrees with `sent_at` falls back to the end of that second through the `Date` offset', () => {
  noteStreamEvent(event(MS), MS)
  expect(eventClientTime(event(MS - 5))).toBeUndefined()
  noteServerDate(new Date(MS).toUTCString(), MS + 300)
  noteServerDate('not a date', 0)
  // Date samples: stamped (floored) before arrival, so the offset is at most -300 here.
  expect(eventClientTime(event(MS - 5))).toBe(MS + 1000 + 300)
  expect(eventClientTime(event(MS + 9000))).toBe(MS + 1000 + 300)
  expect(eventClientTime({ event_id: 'opaque', sent_at: SECOND })).toBe(MS + 1000 + 300)
})

test('B-NOT-14 a read that landed after the event is not read again; an older or an unplaced one is', () => {
  // The own write's refetch landed after its echo had arrived (the echo waited for the write to settle).
  expect(readMayPredate(MS + 80, MS)).toBe(false)
  // A colleague's change after the read landed.
  expect(readMayPredate(MS - 80, MS)).toBe(true)
  expect(readMayPredate(Number.MAX_SAFE_INTEGER, undefined)).toBe(true)
})
