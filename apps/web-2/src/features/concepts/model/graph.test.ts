import { describe, expect, test } from 'vite-plus/test'

import type { ConceptGraph, ConceptView } from '#/shared/api/gen/types.gen'

import { conceptRows, conceptStatus, courseActivities, prerequisiteChoices, toggled, type ActivityInfo } from './graph'

const concept = (id: string, status: string, position: number): ConceptView => ({
  id,
  name: `Concept ${id}`,
  description: '',
  slug: id,
  origin: 'ai',
  position,
  status,
})

const graph: ConceptGraph = {
  can_edit: true,
  latest_run_id: null,
  concepts: [
    concept('a', 'approved', 2),
    concept('b', 'suggested', 3),
    concept('c', 'rejected', 0),
    concept('d', 'approved', 1),
  ],
  prerequisites: [{ concept_id: 'a', requires_id: 'd', status: 'approved' }],
  tags: [
    {
      id: 't1',
      concept_id: 'a',
      activity_id: 'act1',
      item_id: null,
      weight: 1,
      status: 'approved',
      origin: 'ai',
      rationale: '',
    },
    {
      id: 't2',
      concept_id: 'a',
      activity_id: 'act2',
      item_id: 'q1',
      weight: 0.5,
      status: 'suggested',
      origin: 'ai',
      rationale: '',
    },
    {
      id: 't3',
      concept_id: 'a',
      activity_id: 'gone',
      item_id: null,
      weight: 1,
      status: 'approved',
      origin: 'ai',
      rationale: '',
    },
  ],
}

const curriculum = {
  chapters: [
    { activities: [{ id: 'act1', name: 'Lecture', activity_type: 'dynamic' }] },
    { activities: [{ id: 'act2', name: 'Quiz', activity_type: 'quiz' }] },
  ],
} satisfies { chapters: { activities: ActivityInfo[] }[] }

describe('concept graph', () => {
  test('B-CON-01 suggested first, then approved, rejected last; course order inside a status', () => {
    const rows = conceptRows(graph, courseActivities(curriculum))
    expect(rows.map(row => row.concept.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  test('B-CON-01 a tag names its activity, marks a question, keeps an unknown activity as null', () => {
    const row = conceptRows(graph, courseActivities(curriculum)).find(item => item.concept.id === 'a')
    expect(row?.requires.map(required => required.id)).toEqual(['d'])
    expect(row?.tags.map(tag => [tag.activity, tag.question, tag.status])).toEqual([
      ['Lecture', false, 'approved'],
      ['Quiz', true, 'suggested'],
      [null, false, 'approved'],
    ])
  })

  test('B-CON-01 an unknown status string reads as suggested', () => {
    expect(conceptStatus('approved')).toBe('approved')
    expect(conceptStatus('rejected')).toBe('rejected')
    expect(conceptStatus('pending')).toBe('suggested')
  })

  test('B-CON-04 a checkbox click adds or drops one id', () => {
    const selected = toggled(toggled(new Set(), 'a'), 'b')
    expect([...selected]).toEqual(['a', 'b'])
    expect([...toggled(selected, 'a')]).toEqual(['b'])
  })

  test('B-CON-07 a concept may require any other one that is not rejected', () => {
    expect(prerequisiteChoices(graph, 'a').map(choice => choice.id)).toEqual(['b', 'd'])
  })
})
