import type { DisagreementView, GradeDraftView } from '#/shared/api/gen/types.gen'

// The consistency report names parts and criteria by key (docs/AI-FIRST.md 4.5); the activity's drafts carry their
// titles and labels, so the page shows words, not ids.

export type Labels = { part: (key: string) => string | null; criterion: (part: string, key: string) => string | null }

/**
 * Titles of the questions (parts) and labels of their criteria as the drafts state them (B-AIG-09); a key no draft
 * names is null (the page then says «Вопрос» / shows the key). A file task's one part has no title of its own.
 */
export function labelsFromDrafts(drafts: readonly GradeDraftView[]): Labels {
  const parts = new Map<string, string>()
  const criteria = new Map<string, string>()
  for (const draft of drafts) {
    for (const part of draft.proposal?.parts ?? []) {
      if (!draft.is_file && part.title.trim()) parts.set(part.part_id, part.title)
      for (const criterion of part.criteria)
        if (criterion.label.trim()) criteria.set(`${part.part_id}\n${criterion.criterion_id}`, criterion.label)
    }
  }
  return {
    part: key => parts.get(key) ?? null,
    criterion: (part, key) => criteria.get(`${part}\n${key}`) ?? null,
  }
}

/** How far the teacher's grade went from the draft, in percentage points (B-AIG-07): positive = above the AI. */
export const disagreementGap = (row: DisagreementView): number => row.final_score - row.ai_score

/** A drift offset (mean (teacher - ai) / max) as percentage points: negative = the AI grades higher (B-AIG-08). */
export const driftPoints = (offset: number): number => Math.round(offset * 1000) / 10
