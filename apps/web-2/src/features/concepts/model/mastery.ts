import type { ConceptMastery, MasteryLevel } from '#/shared/api/gen/types.gen'

/** The levels from the best to the not yet started (docs/AI-FIRST.md 3.2): the order of the class map's columns. */
export const LEVELS = ['mastered', 'learning', 'struggling', 'not_started'] as const satisfies readonly MasteryLevel[]

/** A probability 0..1 as a share 0..100 (`formatPercent` takes the API's 0..100); `null` without evidence. */
export const percentOf = (p: number | null): number | null => (p === null ? null : Math.round(p * 100))

/**
 * The learner's concepts, the weak first: what to review leads (struggling, then learning, then not started), the
 * mastered close the list; the server's order inside a level.
 */
const WEAK_FIRST: Record<MasteryLevel, number> = { struggling: 0, learning: 1, not_started: 2, mastered: 3 }
export const weakFirst = (concepts: readonly ConceptMastery[]): ConceptMastery[] =>
  concepts.toSorted((a, b) => WEAK_FIRST[a.level] - WEAK_FIRST[b.level])
