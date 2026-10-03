// The API's clock as seen from this tab: event times are server time, a query's `dataUpdatedAt` is ours (spec 7.7).

/** Server minus client clock, ms: a lower bound (see `noteServerDate`); unknown until the first response. */
let offset: number | undefined

/**
 * One response's `Date` header. The server stamped it (whole seconds, floored) before the response arrived at
 * `receivedAt`, so `Date - receivedAt` never exceeds the true offset; the largest sample is the tightest bound.
 */
export function noteServerDate(date: string | null, receivedAt = Date.now()): void {
  const stamped = date ? Date.parse(date) : Number.NaN
  if (Number.isNaN(stamped)) return
  offset = Math.max(offset ?? Number.NEGATIVE_INFINITY, stamped - receivedAt)
}

export const serverOffset = (): number | undefined => offset

/**
 * When an event happened, server ms. Its stream id is `<ms>-<seq>` (the append); `sent_at` (whole seconds) is
 * stamped by the API just before it. An id inside that second (or the next: the append follows the stamp) is used;
 * otherwise (another clock, another id form) the end of the `sent_at` second, which is never early.
 */
export function eventServerTime(event: { event_id: string; sent_at: number }): number {
  const appended = Number(event.event_id.split('-')[0])
  const second = event.sent_at * 1000
  return Number.isInteger(appended) && appended >= second && appended < second + 2000 ? appended : second + 1000
}

/**
 * Whether a read that landed at `dataUpdatedAt` (client ms) may predate an event at `eventAt` (server ms): with no
 * offset known, always. The offset is a lower bound, so the event's client time is never placed too early.
 * ponytail: "landed after" stands for "handled after"; a read in flight across the change (answered after it, read
 * before it) is not refetched. Request start times per query would close that, if it ever shows.
 */
export function readMayPredate(dataUpdatedAt: number, eventAt: number, serverOffsetMs: number | undefined): boolean {
  return serverOffsetMs === undefined || dataUpdatedAt <= eventAt - serverOffsetMs
}
