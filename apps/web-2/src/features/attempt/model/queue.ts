import * as v from 'valibot'

import type { ItemAnswer } from '#/shared/api/gen/types.gen'
import { vItemAnswer } from '#/shared/api/gen/valibot.gen'

/**
 * The attempt's local queue (spec 7.8, R-08): answers the server has not acknowledged yet, in the order given.
 * The server draft stays the source of truth; this holds only what is on its way there. Each entry has its own id,
 * so an acknowledgement removes exactly what was sent: a newer answer given while a save was in flight survives it.
 */
export type Entry = { id: string; item: string; answer: ItemAnswer }
export type Queue = Entry[]

export const vQueue = v.array(v.object({ id: v.string(), item: v.string(), answer: vItemAnswer }))

/** A new answer to a question replaces its older queued one and goes to the end. */
export const enqueue = (queue: Queue, entry: Entry): Queue => [...queue.filter(e => e.item !== entry.item), entry]

/** The body of one save: every queued answer by question (one entry per question, so the order cannot clash). */
export const patchOf = (queue: Queue): Record<string, ItemAnswer> =>
  Object.fromEntries(queue.map(entry => [entry.item, entry.answer]))

/** The server took these entries: drop them. Acknowledging twice, or an unknown id, changes nothing. */
export const ack = (queue: Queue, ids: readonly string[]): Queue => queue.filter(entry => !ids.includes(entry.id))

/** What the learner sees: the server draft's answers with the unacknowledged ones on top. */
export const overlay = (answers: Record<string, ItemAnswer>, queue: Queue): Record<string, ItemAnswer> => ({
  ...answers,
  ...patchOf(queue),
})

/** The storage key of an attempt's unsent answers: per user and attempt (a shared computer keeps them apart). */
export const draftKey = (userId: string, attemptId: string): `ab.${string}` => `ab.attempt.${userId}.${attemptId}`
