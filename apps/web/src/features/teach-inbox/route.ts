// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

/** The teacher `kind`s `GET /work` returns (`WorkItem.kind` is a plain string in the contract). */
export const INBOX_KINDS = ['sla_breach', 'needs_grading', 'awaiting_release'] as const
export type InboxKind = (typeof INBOX_KINDS)[number]

export const isInboxKind = (kind: string): kind is InboxKind => INBOX_KINDS.some(known => known === kind)

/** /teach?kind=&course=: both optional; an unknown value is the whole queue, not an error page. */
export const inboxSearchSchema = v.object({
  kind: v.fallback(v.optional(v.picklist(INBOX_KINDS)), undefined),
  course: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
})
export type InboxSearch = v.InferOutput<typeof inboxSearchSchema>
