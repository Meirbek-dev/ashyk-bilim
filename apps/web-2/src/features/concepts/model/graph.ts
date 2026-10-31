import type { Activity, ConceptGraph, ConceptId, ConceptTagView, ConceptView } from '#/shared/api/gen/types.gen'

/**
 * The course concept graph as the teacher's tab shows it (docs/AI-FIRST.md 2): each concept with its status, the
 * concepts it requires and the activities that exercise it. Pure: the UI only lays it out.
 */
export type ConceptStatus = 'suggested' | 'approved' | 'rejected'

/** The contract spells statuses as plain strings: an unknown one reads as «suggested» (awaits a decision). */
export const conceptStatus = (status: string): ConceptStatus =>
  status === 'approved' || status === 'rejected' ? status : 'suggested'

export type ActivityInfo = Pick<Activity, 'id' | 'name' | 'activity_type'>

/** The course's activities in curriculum order (chapter by chapter). */
export const courseActivities = (curriculum: {
  chapters: readonly { activities: readonly ActivityInfo[] }[]
}): ActivityInfo[] =>
  curriculum.chapters.flatMap(chapter =>
    chapter.activities.map(({ id, name, activity_type }) => ({ id, name, activity_type })),
  )

export type TagRow = {
  tag: ConceptTagView
  status: ConceptStatus
  /** The activity's name; `null` for an activity no longer in the curriculum. */
  activity: string | null
  /** The tag marks one question of the activity, not the whole of it. */
  question: boolean
}

export type ConceptRow = {
  concept: ConceptView
  status: ConceptStatus
  requires: ConceptView[]
  tags: TagRow[]
}

const STATUS_ORDER: Record<ConceptStatus, number> = { suggested: 0, approved: 1, rejected: 2 }

/** Concepts awaiting a decision first, then approved, rejected last; inside a group the course order (`position`). */
export function conceptRows(graph: ConceptGraph, activities: readonly ActivityInfo[]): ConceptRow[] {
  const names = new Map(activities.map(activity => [activity.id, activity.name]))
  const byId = new Map(graph.concepts.map(concept => [concept.id, concept]))
  return graph.concepts
    .map(concept => ({
      concept,
      status: conceptStatus(concept.status),
      requires: requiredIds(graph, concept.id).flatMap(id => byId.get(id) ?? []),
      tags: graph.tags
        .filter(tag => tag.concept_id === concept.id)
        .map(tag => ({
          tag,
          status: conceptStatus(tag.status),
          activity: names.get(tag.activity_id) ?? null,
          question: tag.item_id !== null,
        })),
    }))
    .toSorted((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.concept.position - b.concept.position)
}

/** The ids of the concepts `conceptId` requires. */
export const requiredIds = (graph: ConceptGraph, conceptId: ConceptId): ConceptId[] =>
  graph.prerequisites.filter(edge => edge.concept_id === conceptId).map(edge => edge.requires_id)

/** What a concept may require: every other concept that is not rejected. */
export const prerequisiteChoices = (graph: ConceptGraph, conceptId: ConceptId): ConceptView[] =>
  graph.concepts.filter(concept => concept.id !== conceptId && conceptStatus(concept.status) !== 'rejected')

/** The selection after a click on one checkbox. */
export function toggled(selected: ReadonlySet<ConceptId>, id: ConceptId): Set<ConceptId> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** The weights a teacher picks for a new tag (the server takes any in (0, 1]). */
export const TAG_WEIGHTS = [1, 0.75, 0.5, 0.25] as const
