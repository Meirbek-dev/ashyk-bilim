// Server time as seen from this tab: event times are the server's, a query's `dataUpdatedAt` is ours (spec 7.7).
// Each offset (server minus client, ms) is a lower bound: the largest "stamped - received" sample so far.

type Stamped = { event_id: string; sent_at: number }

let apiOffset: number | undefined
let streamOffset: number | undefined

const raise = (current: number | undefined, sample: number) => Math.max(current ?? Number.NEGATIVE_INFINITY, sample)

/** The append time of a stream event (`<ms>-<seq>` id), or null for an id of another form. */
function appendedAt(event: Stamped): number | null {
  const appended = Number(event.event_id.split('-')[0])
  return Number.isInteger(appended) && appended > 0 ? appended : null
}

/** One API response's `Date` (whole seconds, floored, stamped before `receivedAt`). */
export function noteServerDate(date: string | null, receivedAt = Date.now()): void {
  const stamped = date ? Date.parse(date) : Number.NaN
  if (!Number.isNaN(stamped)) apiOffset = raise(apiOffset, stamped - receivedAt)
}

/** One stream event as it arrives: appended (stream clock, ms) before `receivedAt`. */
export function noteStreamEvent(event: Stamped, receivedAt = Date.now()): void {
  const appended = appendedAt(event)
  if (appended !== null) streamOffset = raise(streamOffset, appended - receivedAt)
}

/**
 * When an event happened, on this tab's clock, never earlier than the truth; undefined when unknown. The append
 * time (ms) with the stream's own offset (events arrive within ms, so it is tight) when it agrees with `sent_at`,
 * the API's stamp (whole seconds) just before the append; otherwise the end of the `sent_at` second through the
 * API's offset (`Date` headers).
 */
export function eventClientTime(event: Stamped): number | undefined {
  const appended = appendedAt(event)
  const second = event.sent_at * 1000
  if (appended !== null && streamOffset !== undefined && appended >= second && appended < second + 2000)
    return appended - streamOffset
  return apiOffset === undefined ? undefined : second + 1000 - apiOffset
}

/**
 * Whether a read that landed at `dataUpdatedAt` may predate an event at `eventAt` (both client ms).
 * ponytail: "landed after" stands for "handled after"; a read in flight across the change (answered after it, read
 * before it) is not refetched. Request start times per query would close that, if it ever shows.
 */
export const readMayPredate = (dataUpdatedAt: number, eventAt: number | undefined): boolean =>
  eventAt === undefined || dataUpdatedAt <= eventAt

/** Tests only: forget every sample. */
export function resetServerClock(): void {
  apiOffset = undefined
  streamOffset = undefined
}
