import * as v from 'valibot'

import type { ReviewSort } from '#/shared/api/gen/types.gen'

// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").

/** The one status filter of both queues; the file queue calls "needs grading" `submitted`. */
export const QUEUE_STATUSES = ['needs_grading', 'graded', 'published', 'returned'] as const
export type QueueStatus = (typeof QUEUE_STATUSES)[number]
export const SORTS = ['submitted_at', 'final_score', 'attempt_number'] as const satisfies readonly ReviewSort[]

const optionalText = v.fallback(
  v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.transform(text => text || undefined),
    ),
  ),
  undefined,
)
const flag = v.fallback(v.optional(v.literal(true)), undefined)
/** `?group=`: one of the course's groups (B-GRD-24); a malformed id is no filter. */
const group = v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined)

/** `?status=&q=&late=&group=&sort=&order=` of the queue and of the review page (prev/next walk the same queue). */
export const queueSearchSchema = v.object({
  status: v.fallback(v.optional(v.picklist(QUEUE_STATUSES)), undefined),
  q: optionalText,
  late: flag,
  group,
  sort: v.fallback(v.optional(v.picklist(SORTS)), undefined),
  order: v.fallback(v.optional(v.picklist(['asc', 'desc'])), undefined),
})
export type QueueSearch = v.InferOutput<typeof queueSearchSchema>

/** `/teach/courses/$courseId/gradebook?q=&pending=&group=`: all three go to the server (B-GRD-20, B-GRD-24). */
export const gradebookSearchSchema = v.object({ q: optionalText, pending: flag, group })
export type GradebookSearch = v.InferOutput<typeof gradebookSearchSchema>
