import type { QueryClient } from '@tanstack/react-query'
import { AsyncRetryer } from '@tanstack/react-pacer'
import * as v from 'valibot'

import { sessionOptions } from '#/shared/auth/session'

import { invalidationsFor, type UserEvent } from './event-invalidations'
import type { MyEventsData, UserStreamEvent } from './gen/types.gen'
import { vUserStreamEvent } from './gen/valibot.gen'

// The one live connection of a tab (spec 7.7): the `myEvents` operation, `GET /me/events`. The generated SSE client
// cannot be steered (no pause, no Last-Event-ID on our terms, its own retry timers), so the stream is read here.

const EVENTS_URL: MyEventsData['url'] = '/api/v2/me/events'
/** A connection that lived this long was healthy: when it drops, the next one opens at once. */
const HEALTHY_MS = 30_000
const MAX_WAIT_MS = 30_000

type Fetch = (url: string, init: RequestInit) => Promise<Response>

export type EventStreamOptions = {
  fetch: Fetch
  onEvent: (event: UserEvent) => void
  /** A reconnect without an event id to resume from: whatever happened meanwhile must be read again. */
  onResync: () => void
  /** 401 or `closed`: the session is gone (or changed); the stream has ended for good. */
  onSessionLost: () => void
  /** First backoff step in ms (doubles per failed attempt, up to 30 s). */
  baseWait?: number
}

export type EventStream = { resume: () => void; pause: () => void; stop: () => void }

/** The `data` of each message of an SSE body; comments (the heartbeat) and other fields are skipped. */
async function* sseData(body: NonNullable<Response['body']>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer = (buffer + value).replaceAll('\r\n', '\n')
      let end = buffer.indexOf('\n\n')
      while (end >= 0) {
        const data = buffer
          .slice(0, end)
          .split('\n')
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(line.startsWith('data: ') ? 6 : 5))
          .join('\n')
        if (data) yield data
        buffer = buffer.slice(end + 2)
        end = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

const isStreamEvent = (value: unknown): value is UserStreamEvent =>
  typeof value === 'object' && value !== null && 'event' in value

// Dev and tests hold every event to the contract schema; the build trusts the server, like the SDK (spec 7.4).
function readEvent(data: string): UserStreamEvent | null {
  const value: unknown = JSON.parse(data)
  if (import.meta.env.DEV) return v.parse(vUserStreamEvent, value)
  return isStreamEvent(value) ? value : null
}

/**
 * The reconnecting stream without the browser around it (tests drive it with a fake fetch). `resume` opens it (with
 * `Last-Event-ID` once an event was seen), `pause` closes it until the next `resume`, `stop` ends it.
 */
export function createEventStream(options: EventStreamOptions): EventStream {
  let lastEventId: string | undefined
  let connectedBefore = false
  let ended = false

  const end = () => {
    ended = true
    options.onSessionLost()
    return 'ended' as const
  }

  async function connect(signal: AbortSignal | null): Promise<'ended' | 'dropped'> {
    const headers: Record<string, string> = lastEventId ? { 'Last-Event-ID': lastEventId } : {}
    const response = await options.fetch(EVENTS_URL, { headers, signal, cache: 'no-store' })
    if (response.status === 401) return end()
    if (!response.ok || !response.body) throw new Error(`event stream answered ${response.status}`)
    let opened: number | undefined
    const healthy = () => opened !== undefined && Date.now() - opened >= HEALTHY_MS
    try {
      for await (const data of sseData(response.body)) {
        const event = readEvent(data)
        if (event?.event === 'connected') {
          if (connectedBefore && !lastEventId) options.onResync()
          connectedBefore = true
          opened = Date.now()
        } else if (event?.event === 'closed') {
          return end()
        } else if (event) {
          lastEventId = event.event_id
          options.onEvent(event)
        }
      }
    } catch (error) {
      if (!healthy()) throw error
    }
    // Ended by the server or the network: a long-lived stream reopens at once, a short one backs off (no hot loop).
    if (!healthy()) throw new Error('event stream ended early')
    return 'dropped'
  }

  const retryer: AsyncRetryer<() => Promise<'ended' | 'dropped'>> = new AsyncRetryer(
    () => connect(retryer.getAbortSignal()),
    {
      backoff: 'exponential',
      baseWait: options.baseWait ?? 1000,
      maxWait: MAX_WAIT_MS,
      jitter: 0.2,
      maxAttempts: Number.POSITIVE_INFINITY,
      throwOnError: false,
    },
  )

  async function run(): Promise<void> {
    // A new execute aborts the running one: one connection at a time, attempts counted from 1 again. A healthy
    // stream that dropped opens the next one now; anything else (ended, paused, stopped) leaves the loop.
    for (;;) {
      if (ended || (await retryer.execute()) !== 'dropped') return
    }
  }

  return {
    resume: () => {
      if (!ended) void run()
    },
    pause: () => retryer.abort(),
    stop: () => {
      ended = true
      retryer.abort()
    },
  }
}

/**
 * The tab's stream (mounted once by the authed shell): each event invalidates its table keys and goes to `onEvent`;
 * a hidden tab closes the connection and a visible one resumes it. Returns the stop function.
 */
export function startEventStream(queryClient: QueryClient, onEvent: (event: UserEvent) => void): () => void {
  // An event never cancels a read already in flight: that read is newer than the event.
  const invalidate = (queryKey?: readonly unknown[]) =>
    void queryClient.invalidateQueries(queryKey ? { queryKey } : {}, { cancelRefetch: false })
  const stream = createEventStream({
    fetch: (url, init) => fetch(url, init),
    onEvent: event => {
      for (const queryKey of invalidationsFor(event.event, event.payload)) invalidate(queryKey)
      onEvent(event)
    },
    onResync: () => invalidate(),
    // The session read decides: a lost session clears it, which re-runs the guards and unmounts the stream.
    onSessionLost: () => invalidate(sessionOptions().queryKey),
  })
  const onVisibility = () => (document.hidden ? stream.pause() : stream.resume())
  document.addEventListener('visibilitychange', onVisibility)
  if (!document.hidden) stream.resume()
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    stream.stop()
  }
}
