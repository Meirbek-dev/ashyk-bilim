import { describe, expect, test } from 'vite-plus/test'

import type { Activity, Curriculum, CurriculumChapter } from '#/shared/api/gen/types.gen'

import {
  applyLayout,
  layoutMove,
  layoutOf,
  withActivity,
  withChapter,
  withoutActivity,
  withoutChapter,
} from './curriculum'

const activity = (id: string, chapter_id: string, position: number): Activity => ({
  id,
  chapter_id,
  position,
  course_id: 'c',
  name: id,
  activity_type: 'dynamic',
  activity_sub_type: 'dynamic_page',
  allowed_actions: ['update', 'delete', 'move'],
  published: false,
  version: 1,
})

const chapter = (id: string, position: number, ids: string[]): CurriculumChapter => ({
  id,
  position,
  course_id: 'c',
  name: id,
  description: '',
  allowed_actions: ['update', 'delete', 'move', 'add_activity'],
  activities: ids.map((a, at) => activity(a, id, at + 1)),
})

const curriculum: Curriculum = { chapters: [chapter('A', 1, ['a1', 'a2', 'a3']), chapter('B', 2, ['b1'])] }
const ids = (c: Curriculum) =>
  c.chapters.map(ch => `${ch.id}${ch.position}:${ch.activities.map(a => `${a.id}@${a.position}`).join(',')}`)

describe('reordering', () => {
  test('B-CST-11 a chapter dropped first is one move to position 1, positions renumbered', () => {
    const before = layoutOf(curriculum)
    const after = { ...before, chapters: ['B', 'A'] }
    expect(layoutMove(before, after, 'B')).toEqual({ kind: 'chapter', id: 'B', position: 1 })
    expect(ids(applyLayout(curriculum, after))).toEqual(['B1:b1@1', 'A2:a1@1,a2@2,a3@3'])
  })

  test('B-CST-11 an activity moved into another chapter carries its new chapter id and 1-based position', () => {
    const before = layoutOf(curriculum)
    const after = { chapters: ['A', 'B'], activities: { A: ['a1', 'a3'], B: ['a2', 'b1'] } }
    expect(layoutMove(before, after, 'a2')).toEqual({ kind: 'activity', id: 'a2', chapterId: 'B', position: 1 })
    const placed = applyLayout(curriculum, after)
    expect(ids(placed)).toEqual(['A1:a1@1,a3@2', 'B2:a2@1,b1@2'])
    expect(placed.chapters[1]?.activities[0]?.chapter_id).toBe('B')
  })

  test('B-CST-11 dropping where it was is no move', () => {
    const before = layoutOf(curriculum)
    expect(layoutMove(before, before, 'a1')).toBeNull()
    expect(layoutMove(before, before, 'A')).toBeNull()
  })
})

describe('cache patches', () => {
  test('B-CST-07 a new chapter is appended last with no activities; a rename replaces in place', () => {
    const { activities: _, ...c } = chapter('C', 3, [])
    expect(withChapter(curriculum, c).chapters.map(ch => ch.id)).toEqual(['A', 'B', 'C'])
    const renamed = withChapter(curriculum, { ...c, id: 'A', name: 'New' })
    expect(renamed.chapters[0]).toMatchObject({ id: 'A', name: 'New' })
    expect(renamed.chapters[0]?.activities).toHaveLength(3)
  })

  test('B-CST-10 deleting renumbers the siblings', () => {
    expect(ids(withoutActivity(curriculum, 'a1'))).toEqual(['A1:a2@1,a3@2', 'B2:b1@1'])
    expect(ids(withoutChapter(curriculum, 'A'))).toEqual(['B1:b1@1'])
  })

  test('B-CST-09 an updated activity replaces its row; a new one is appended to its chapter', () => {
    const renamed = withActivity(curriculum, { ...activity('a2', 'A', 2), name: 'Renamed' })
    expect(renamed.chapters[0]?.activities[1]?.name).toBe('Renamed')
    expect(ids(withActivity(curriculum, activity('b2', 'B', 2)))).toEqual(['A1:a1@1,a2@2,a3@3', 'B2:b1@1,b2@2'])
  })
})
