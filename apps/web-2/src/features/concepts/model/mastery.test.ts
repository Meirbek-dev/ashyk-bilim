import { describe, expect, test } from 'vite-plus/test'

import type { ConceptMastery, MasteryLevel } from '#/shared/api/gen/types.gen'

import { LEVELS, percentOf, weakFirst } from './mastery'

const mine = (id: string, level: MasteryLevel): ConceptMastery => ({
  concept_id: id,
  name: id,
  level,
  p_known: 0.5,
  evidence_count: 1,
  last_observed_at: null,
  review: [],
  stale: false,
})

describe('mastery', () => {
  test('B-CON-09 the class map lists the levels best first; the mean as a share, none without evidence', () => {
    expect(LEVELS).toEqual(['mastered', 'learning', 'struggling', 'not_started'])
    expect(percentOf(0.625)).toBe(63)
    expect(percentOf(null)).toBeNull()
  })

  test('B-CON-11 the weak concepts lead: struggling, learning, not started, mastered last; server order inside', () => {
    const concepts = [
      mine('m', 'mastered'),
      mine('l1', 'learning'),
      mine('s', 'struggling'),
      mine('n', 'not_started'),
      mine('l2', 'learning'),
    ]
    expect(weakFirst(concepts).map(concept => concept.concept_id)).toEqual(['s', 'l1', 'l2', 'n', 'm'])
  })
})
