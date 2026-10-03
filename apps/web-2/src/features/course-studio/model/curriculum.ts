import type { Activity, Chapter, Curriculum, CurriculumChapter } from '#/shared/api/gen/types.gen'

// The curriculum cache takes every write itself: moves answer 204, creates answer the new row, and a refetch would
// repeat the page's GET. Positions stay 1-based and contiguous, as the server renumbers them.

/** The order the drag-and-drop lists hold: chapter ids, and activity ids per chapter. */
export type Layout = { chapters: string[]; activities: Record<string, string[]> }

export const layoutOf = (curriculum: Curriculum): Layout => ({
  chapters: curriculum.chapters.map(chapter => chapter.id),
  activities: Object.fromEntries(
    curriculum.chapters.map(chapter => [chapter.id, chapter.activities.map(activity => activity.id)]),
  ),
})

/** The curriculum rearranged to a layout: activities follow their ids into other chapters, positions renumbered. */
export function applyLayout(curriculum: Curriculum, layout: Layout): Curriculum {
  const chapters = new Map(curriculum.chapters.map(chapter => [chapter.id, chapter]))
  const activities = new Map(curriculum.chapters.flatMap(chapter => chapter.activities).map(a => [a.id, a]))
  return {
    chapters: layout.chapters.flatMap((chapterId, index) => {
      const chapter = chapters.get(chapterId)
      if (!chapter) return []
      const ids = layout.activities[chapterId] ?? []
      const placed = ids.flatMap((id, at) => {
        const activity = activities.get(id)
        return activity ? [{ ...activity, chapter_id: chapterId, position: at + 1 }] : []
      })
      return [{ ...chapter, position: index + 1, activities: placed }]
    }),
  }
}

/** One server move that turns `before` into `after`, or null when nothing moved. */
export type Move =
  | { kind: 'chapter'; id: string; position: number }
  | { kind: 'activity'; id: string; chapterId: string; position: number }

export function layoutMove(before: Layout, after: Layout, id: string): Move | null {
  const chapterAt = after.chapters.indexOf(id)
  if (chapterAt >= 0)
    return chapterAt === before.chapters.indexOf(id) ? null : { kind: 'chapter', id, position: chapterAt + 1 }
  const where = (layout: Layout) => {
    for (const [chapterId, ids] of Object.entries(layout.activities)) {
      const at = ids.indexOf(id)
      if (at >= 0) return { chapterId, at }
    }
    return null
  }
  const from = where(before)
  const to = where(after)
  if (!to || (from && from.chapterId === to.chapterId && from.at === to.at)) return null
  return { kind: 'activity', id, chapterId: to.chapterId, position: to.at + 1 }
}

const renumber = <T extends { position: number }>(rows: T[]): T[] =>
  rows.map((row, at) => ({ ...row, position: at + 1 }))

/** A created or renamed chapter: replaced in place, or appended last with no activities. */
export function withChapter(curriculum: Curriculum, chapter: Chapter): Curriculum {
  const known = curriculum.chapters.some(row => row.id === chapter.id)
  const chapters: CurriculumChapter[] = known
    ? curriculum.chapters.map(row => (row.id === chapter.id ? { ...row, ...chapter } : row))
    : [...curriculum.chapters, { ...chapter, activities: [] }]
  return { chapters }
}

/** A created or updated activity: replaced in place, or appended to its chapter. */
export function withActivity(curriculum: Curriculum, activity: Activity): Curriculum {
  return {
    chapters: curriculum.chapters.map(chapter => {
      if (chapter.id !== activity.chapter_id) return chapter
      const known = chapter.activities.some(row => row.id === activity.id)
      const activities = known
        ? chapter.activities.map(row => (row.id === activity.id ? { ...row, ...activity } : row))
        : [...chapter.activities, activity]
      return { ...chapter, activities }
    }),
  }
}

export const withoutChapter = (curriculum: Curriculum, id: string): Curriculum => ({
  chapters: renumber(curriculum.chapters.filter(chapter => chapter.id !== id)),
})

export const withoutActivity = (curriculum: Curriculum, id: string): Curriculum => ({
  chapters: curriculum.chapters.map(chapter =>
    chapter.activities.some(activity => activity.id === id)
      ? { ...chapter, activities: renumber(chapter.activities.filter(activity => activity.id !== id)) }
      : chapter,
  ),
})
