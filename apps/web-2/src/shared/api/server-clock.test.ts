import { expect, test } from 'vite-plus/test'

import { eventServerTime, noteServerDate, readMayPredate, serverOffset } from './server-clock'

const SECOND = 1_700_000_000

test('B-NOT-14 the event time is its stream id when that agrees with `sent_at`, else the end of that second', () => {
  expect(eventServerTime({ event_id: `${SECOND * 1000 + 420}-0`, sent_at: SECOND })).toBe(SECOND * 1000 + 420)
  // The append may fall into the next second after the stamp.
  expect(eventServerTime({ event_id: `${SECOND * 1000 + 1010}-3`, sent_at: SECOND })).toBe(SECOND * 1000 + 1010)
  // Another clock (behind or far ahead) or another id form: never early.
  expect(eventServerTime({ event_id: `${SECOND * 1000 - 5}-0`, sent_at: SECOND })).toBe(SECOND * 1000 + 1000)
  expect(eventServerTime({ event_id: `${SECOND * 1000 + 9000}-0`, sent_at: SECOND })).toBe(SECOND * 1000 + 1000)
  expect(eventServerTime({ event_id: 'opaque', sent_at: SECOND })).toBe(SECOND * 1000 + 1000)
})

test('B-NOT-14 a read that landed after the event (on the server clock) is not read again; an older one is', () => {
  const at = SECOND * 1000 + 420
  // The server clock runs 5 s behind the tab.
  const offset = -5000
  // The own write's refetch landed 80 ms after the echo was sent: the late echo skips it.
  expect(readMayPredate(at - offset + 80, at, offset)).toBe(false)
  // A colleague's change after the read landed: the read is stale.
  expect(readMayPredate(at - offset - 80, at, offset)).toBe(true)
  // Clocks compared as if equal would have skipped that stale read.
  expect(readMayPredate(at - offset - 80, at, 0)).toBe(false)
  // No response seen yet: no offset, always read again.
  expect(readMayPredate(Number.MAX_SAFE_INTEGER, at, undefined)).toBe(true)
})

test('B-NOT-14 the clock offset is the largest `Date - receipt` sample (a lower bound of the true one)', () => {
  noteServerDate(null)
  noteServerDate('not a date')
  expect(serverOffset()).toBeUndefined()
  noteServerDate('Thu, 01 Jan 1970 00:00:10 GMT', 9000)
  noteServerDate('Thu, 01 Jan 1970 00:00:10 GMT', 9500)
  expect(serverOffset()).toBe(1000)
})
