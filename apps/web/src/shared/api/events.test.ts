import { afterEach, expect, test, vi } from 'vite-plus/test'

import type { UserEvent } from './event-invalidations'
import { createEventStream, type EventStreamOptions } from './events'

const USER = '0190a5d2-0000-7000-8000-000000000001'
const connected = { event: 'connected', user_id: USER, event_id: null }
const read = (id: string, count: number) => ({
  event: 'notification.read',
  event_id: id,
  payload: { notification_id: null, unread_count: count },
  sent_at: 1_700_000_000,
})
const message = (data: object) => `data: ${JSON.stringify(data)}\n\n`

/** One fake `/me/events` answer: the test writes SSE text into it and ends it; an abort errors it like fetch does. */
function sse(status = 200) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: c => (controller = c) })
  const encoder = new TextEncoder()
  return {
    response: new Response(status === 200 ? body : null, { status }),
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
    abort: () => controller.error(new DOMException('Aborted', 'AbortError')),
  }
}
type Answer = ReturnType<typeof sse>

/** A stream whose fetch hands out the queued answers in order and records each request's headers. */
function harness(answers: Answer[], options: Partial<EventStreamOptions> = {}) {
  const requests: Headers[] = []
  const events: UserEvent[] = []
  const calls = { resync: 0, sessionLost: 0 }
  const stream = createEventStream({
    fetch: async (_url, init) => {
      const answer = answers.shift()
      if (!answer) return new Promise<Response>(() => {})
      requests.push(new Headers(init.headers))
      init.signal?.addEventListener('abort', answer.abort)
      return answer.response
    },
    onEvent: event => events.push(event),
    onResync: () => (calls.resync += 1),
    onSessionLost: () => (calls.sessionLost += 1),
    baseWait: 1,
    ...options,
  })
  return { stream, requests, events, calls }
}

afterEach(() => vi.useRealTimers())

test('B-NOT-11 data events reach the handler; the heartbeat and `connected` do not', async () => {
  const first = sse()
  const { stream, events, requests } = harness([first])
  stream.resume()
  first.send(':keepalive\n\n')
  first.send(message(connected))
  first.send(message(read('1-0', 3)).slice(0, 20))
  first.send(message(read('1-0', 3)).slice(20))
  await vi.waitFor(() => expect(events).toHaveLength(1))
  expect(events[0]).toMatchObject({ event: 'notification.read', payload: { unread_count: 3 } })
  expect(requests[0]?.get('Last-Event-ID')).toBeNull()
  stream.stop()
})

test('B-NOT-11 a paused stream resumes with Last-Event-ID; only one connection is open at a time', async () => {
  const first = sse()
  const second = sse()
  const { stream, events, requests, calls } = harness([first, second])
  stream.resume()
  first.send(message(connected) + message(read('7-1', 1)))
  await vi.waitFor(() => expect(events).toHaveLength(1))
  stream.pause()
  stream.resume()
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1]?.get('Last-Event-ID')).toBe('7-1')
  second.send(message(connected))
  second.send(message(read('7-2', 0)))
  await vi.waitFor(() => expect(events).toHaveLength(2))
  // The replay covered the gap: nothing to read again.
  expect(calls.resync).toBe(0)
  stream.stop()
})

test('B-NOT-11 a failed or short stream backs off and reconnects; without an event id the data is read again', async () => {
  const failed = sse(503)
  const short = sse()
  const third = sse()
  const { stream, requests, calls } = harness([failed, short, third])
  stream.resume()
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  short.send(message(connected))
  short.end()
  await vi.waitFor(() => expect(requests).toHaveLength(3))
  third.send(message(connected))
  await vi.waitFor(() => expect(calls.resync).toBe(1))
  expect(calls.sessionLost).toBe(0)
  stream.stop()
})

test('B-NOT-11 the `connected` position is the resume point of a tab that saw no event yet', async () => {
  const first = sse()
  const second = sse()
  const { stream, requests, calls } = harness([first, second])
  stream.resume()
  first.send(message({ ...connected, event_id: '9-0' }))
  first.end()
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1]?.get('Last-Event-ID')).toBe('9-0')
  second.send(message(connected))
  expect(calls.resync).toBe(0)
  stream.stop()
})

test('B-NOT-11 a stream that lived long reconnects at once when it drops', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const first = sse()
  const second = sse()
  // A backoff this long would stall the test: the healthy drop must skip it.
  const { stream, requests, events } = harness([first, second], { baseWait: 60_000 })
  stream.resume()
  first.send(message(connected) + message(read('1-0', 0)))
  await vi.waitFor(() => expect(events).toHaveLength(1))
  vi.setSystemTime(Date.now() + 31_000)
  first.end()
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  stream.stop()
})

test('B-NOT-11 401 and `closed` end the stream and report the lost session', async () => {
  const unauthorized = harness([sse(401), sse()])
  unauthorized.stream.resume()
  await vi.waitFor(() => expect(unauthorized.calls.sessionLost).toBe(1))
  const closing = sse()
  const closed = harness([closing, sse()])
  closed.stream.resume()
  closing.send(message(connected) + message({ event: 'closed', code: 'session-expired' }))
  await vi.waitFor(() => expect(closed.calls.sessionLost).toBe(1))
  // Ended for good: resuming opens nothing.
  closed.stream.resume()
  unauthorized.stream.resume()
  await Promise.resolve()
  expect(unauthorized.requests).toHaveLength(1)
  expect(closed.requests).toHaveLength(1)
})

test('B-NOT-11 pause closes the open connection even when the fetch does not tie its body to the signal', async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({ cancel: () => void (cancelled = true) })
  const stream = createEventStream({
    fetch: async () => new Response(body),
    onEvent: () => undefined,
    onResync: () => undefined,
    onSessionLost: () => undefined,
    baseWait: 1,
  })
  stream.resume()
  await vi.waitFor(() => expect(body.locked).toBe(true))
  stream.pause()
  await vi.waitFor(() => expect(cancelled).toBe(true))
  stream.stop()
})
