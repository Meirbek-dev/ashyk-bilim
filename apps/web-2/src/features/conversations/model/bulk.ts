import { m } from '#/paraglide/messages'
import type { BulkResult } from '#/shared/api/gen/types.gen'

import { MAX_RECIPIENTS } from './attachments'

/** Someone a bulk send may go to. */
export type BulkPerson = { id: string; name: string }

/** Ticked at the start: everyone shown, up to the limit of one send. */
export const initialPicks = (people: readonly BulkPerson[]): Set<string> =>
  new Set(people.slice(0, MAX_RECIPIENTS).map(p => p.id))

/** One tick more or less; a 51st stays unticked. */
export function toggle(picks: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(picks)
  if (next.has(id)) next.delete(id)
  else if (next.size < MAX_RECIPIENTS) next.add(id)
  return next
}

/** The toast after a bulk send: how many got it, and how many could not be written to. */
export function bulkSummary(result: BulkResult): string {
  const sent = m.conversations_bulk_sent({ count: result.sent.length })
  return result.skipped.length === 0
    ? sent
    : `${sent}. ${m.conversations_bulk_skipped({ count: result.skipped.length })}`
}
