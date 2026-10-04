// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import * as v from 'valibot'

/** The teacher `kind`s `GET /work` returns (`WorkItem.kind` is a plain string in the contract). */
export const INBOX_KINDS = ['sla_breach', 'needs_grading', 'awaiting_release'] as const
export type InboxKind = (typeof INBOX_KINDS)[number]

/** `GET /work?sort=`; `priority` is the server default. */
export const INBOX_SORTS = ['priority', 'due', 'oldest', 'newest'] as const
export type InboxSort = (typeof INBOX_SORTS)[number]

export const isInboxKind = (kind: string): kind is InboxKind => INBOX_KINDS.some(known => known === kind)

/** /teach?kind=&course=&sort=: all optional; an unknown value is the whole queue in server order, not an error page. */
export const inboxSearchSchema = v.object({
  kind: v.fallback(v.optional(v.picklist(INBOX_KINDS)), undefined),
  course: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
  sort: v.fallback(v.optional(v.picklist(INBOX_SORTS)), undefined),
})
export type InboxSearch = v.InferOutput<typeof inboxSearchSchema>
