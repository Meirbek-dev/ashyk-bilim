import type { ApproveOutcome, GradeDraftView, ProposalCriterion, ProposalPart } from '#/shared/api/gen/types.gen'

import { appendDraft, type FileGradeForm, type GradeForm } from './grade-form'
import { roundScore, toItemScale } from './scoring'

// AI grade drafts beside the grader's own work (docs/AI-FIRST.md 4): the queue's «ИИ» column, the batch approval and
// the review's «Черновик ИИ» card. The draft only proposes; the grader's form and save stay the one way to grade.

/** `GradeDraftView.status` as the server sends it. */
export type DraftStatus = 'queued' | 'ready' | 'applied' | 'discarded' | 'superseded' | 'failed'

/** The newest draft of each work (submission or file attempt id): the list holds one per work, newest wins if not. */
export function draftsBySubject(drafts: readonly GradeDraftView[]): ReadonlyMap<string, GradeDraftView> {
  const by = new Map<string, GradeDraftView>()
  for (const draft of drafts) {
    const known = by.get(draft.subject_id)
    if (!known || draft.created_at > known.created_at) by.set(draft.subject_id, draft)
  }
  return by
}

/** Only a ready draft can be approved, transferred or discarded. */
export const isReady = (draft: GradeDraftView | undefined): draft is GradeDraftView => draft?.status === 'ready'

/** The ready drafts of the selected works (B-GRD-42): a work without one is left out of the approval. */
export const approvable = (
  subjectIds: readonly string[],
  drafts: ReadonlyMap<string, GradeDraftView>,
): GradeDraftView[] => subjectIds.map(id => drafts.get(id)).filter(isReady)

/** While a draft is being written the queue reads the drafts again (the worker fills them in seconds). */
export const anyQueued = (drafts: readonly GradeDraftView[] | null | undefined): boolean =>
  drafts?.some(draft => draft.status === 'queued') ?? false

/** The approval's outcome per draft: what did not apply (stale, not ready, failed), with its work (B-GRD-42). */
export function approveFailures(outcomes: readonly ApproveOutcome[], drafts: readonly GradeDraftView[]) {
  const subjects = new Map(drafts.map(draft => [draft.id, draft.subject_id]))
  return outcomes
    .filter(outcome => outcome.result !== 'applied')
    .map(outcome => ({ ...outcome, subjectId: subjects.get(outcome.draft_id) ?? null }))
}
export type ApproveFailure = ReturnType<typeof approveFailures>[number]

/** A draft written without the work's text (`no_text`) carries no scores to transfer, only words. */
const hasScores = (draft: GradeDraftView) => !draft.flags.includes('no_text')

const scoreInput = (score: number, max: number, rowMax: number) => String(roundScore(toItemScale(score, max, rowMax)))
const withText = (current: string, text: string) => (text.trim() ? appendDraft(current, text) : current)

/** The overall feedback first, then a part's own words when the draft has no overall text. */
const feedbackOf = (draft: GradeDraftView) => {
  const proposal = draft.proposal
  if (!proposal) return ''
  if (proposal.overall_feedback.trim()) return proposal.overall_feedback
  return proposal.parts
    .map(part => part.feedback.trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * «Перенести в форму» on a quiz / exam submission (B-GRD-44): each question's calibrated score on that question's own
 * scale (a part's maximum is the item's), its comment under the grader's, the overall feedback under the written one.
 * The override stays as typed; nothing is saved.
 */
export function transferToGradeForm(draft: GradeDraftView, form: GradeForm): GradeForm {
  const proposal = draft.proposal
  if (!proposal) return form
  const parts = new Map<string, ProposalPart>(proposal.parts.map(part => [part.part_id, part]))
  return {
    ...form,
    feedback: withText(form.feedback, proposal.overall_feedback),
    items: form.items.map(row => {
      const part = parts.get(row.item_id)
      if (!part) return row
      return {
        ...row,
        score: hasScores(draft) ? scoreInput(part.calibrated_score, part.max_score, row.max) : row.score,
        feedback: withText(row.feedback, part.feedback),
      }
    }),
  }
}

/**
 * The same for a file attempt (B-GRD-44): rubric criteria on the rubric's scale, the calibrated work percentage as the
 * grade (before the late penalty, as the form takes it), the feedback under the written one.
 */
export function transferToFileForm(draft: GradeDraftView, form: FileGradeForm): FileGradeForm {
  const proposal = draft.proposal
  if (!proposal) return form
  const criteria = new Map<string, ProposalCriterion>(
    proposal.parts.flatMap(part => part.criteria).map(criterion => [criterion.criterion_id, criterion]),
  )
  const scores = hasScores(draft)
  return {
    feedback: withText(form.feedback, feedbackOf(draft)),
    final_score:
      scores && draft.calibrated_score !== null ? String(roundScore(draft.calibrated_score)) : form.final_score,
    criteria: form.criteria.map(row => {
      const criterion = criteria.get(row.criterion_id)
      return criterion && scores
        ? { ...row, score: scoreInput(criterion.calibrated_score, criterion.max_score, row.max) }
        : row
    }),
  }
}

/** Calibration moved the score: the card shows the raw AI score beside the calibrated one (B-GRD-43). */
export const calibrated = (raw: number | null, adjusted: number | null): boolean =>
  raw !== null && adjusted !== null && roundScore(raw) !== roundScore(adjusted)
