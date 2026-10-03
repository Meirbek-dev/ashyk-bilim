import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type {
  AssessmentItem,
  Attempt,
  FileGradeAction,
  FileGradeRequest,
  FileRubric,
  GradeAction,
  GradeRequest,
  TeacherSubmission,
} from '#/shared/api/gen/types.gen'

import { isScoreInputInvalid, parseScoreInput, roundScoreInput, toItemScale } from './scoring'

// The grade forms keep scores as typed text (blank = "not scored" / "no override") and become a request on save.
// Ranges per score come from the item or criterion maximum; lengths are the server's (422 under the field).

// Messages are functions: read at validation time, in the current locale.
const percentField = v.pipe(
  v.string(),
  v.check(
    text => !isScoreInputInvalid(text),
    () => m.grading_score_range({ max: 100 }),
  ),
)
const inRange = (row: { score: string; max: number }) => !isScoreInputInvalid(row.score, row.max)
const seedText = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value))

// ---- Assessment submissions (B-GRD-12, B-GRD-13) ----

const itemObject = v.object({ item_id: v.string(), max: v.number(), score: v.string(), feedback: v.string() })
const itemRow = v.pipe(
  itemObject,
  v.forward(
    v.check(
      (row: v.InferOutput<typeof itemObject>) => inRange(row),
      () => m.grading_score_invalid(),
    ),
    ['score'],
  ),
)
export const gradeFormSchema = v.object({ final_score: percentField, feedback: v.string(), items: v.array(itemRow) })
export type GradeForm = v.InferOutput<typeof gradeFormSchema>

/** The form of a submission: item scores on each item's own scale, at hundredths; the stored override and feedback. */
export function gradeForm(submission: TeacherSubmission, items: readonly AssessmentItem[]): GradeForm {
  const graded = new Map((submission.grading.items ?? []).map(item => [item.item_id, item]))
  return {
    final_score: roundScoreInput(seedText(submission.score_override)),
    feedback: submission.grading.feedback ?? '',
    items: items.map(item => {
      const done = graded.get(item.id)
      const score = done ? toItemScale(done.score, done.max_score, item.max_score) : null
      return {
        item_id: item.id,
        max: item.max_score,
        score: roundScoreInput(seedText(score)),
        // Teacher prose has no code; an auto-grader verdict is shown apart, not edited.
        feedback: done && !done.feedback_code ? (done.feedback ?? '') : '',
      }
    }),
  }
}

/**
 * The save: only the items the grader changed (an untouched item keeps its stored score); the override is omitted
 * when unchanged, `null` when cleared (BUG-174: drop it and recompute from the items).
 */
export function gradeRequest(form: GradeForm, seed: GradeForm, action: GradeAction): GradeRequest {
  const item_grades = form.items.flatMap((row, index) => {
    const before = seed.items[index]
    if (before && before.score === row.score && before.feedback === row.feedback) return []
    const score = parseScoreInput(row.score, row.max)
    return [
      {
        item_id: row.item_id,
        ...(score === null ? {} : { score }),
        ...(before?.feedback === row.feedback ? {} : { feedback: row.feedback }),
      },
    ]
  })
  const override = form.final_score.trim()
  const final_score =
    override === seed.final_score.trim() ? undefined : override === '' ? null : parseScoreInput(override)
  return {
    action,
    feedback: form.feedback,
    ...(item_grades.length > 0 ? { item_grades } : {}),
    ...(final_score === undefined ? {} : { final_score }),
  }
}

// ---- File attempts (B-GRD-16) ----

const criterionObject = v.object({ criterion_id: v.string(), label: v.string(), max: v.number(), score: v.string() })
const criterionRow = v.pipe(
  criterionObject,
  v.forward(
    v.check(
      (row: v.InferOutput<typeof criterionObject>) => inRange(row),
      () => m.grading_score_invalid(),
    ),
    ['score'],
  ),
)
export const fileGradeSchema = v.object({
  final_score: percentField,
  feedback: v.string(),
  criteria: v.array(criterionRow),
})
export type FileGradeForm = v.InferOutput<typeof fileGradeSchema>

/** The grader's score before the late penalty (`raw_score`), the rubric criteria with their stored points. */
export function fileGradeForm(attempt: Attempt, rubric: FileRubric): FileGradeForm {
  const scored = new Map((attempt.rubric_scores?.criteria ?? []).map(score => [score.criterion_id, score.score]))
  return {
    final_score: roundScoreInput(seedText(attempt.raw_score)),
    feedback: attempt.feedback ?? '',
    criteria: (rubric.criteria ?? []).map(criterion => ({
      criterion_id: criterion.criterion_id,
      label: criterion.label,
      max: criterion.max_score,
      score: roundScoreInput(seedText(scored.get(criterion.criterion_id))),
    })),
  }
}

/** A blank criterion is left out; no rubric, no `rubric_scores` (the stored ones are kept). */
export function fileGradeRequest(form: FileGradeForm, action: FileGradeAction): FileGradeRequest {
  const score = parseScoreInput(form.final_score)
  const criteria = form.criteria.flatMap(row => {
    const points = parseScoreInput(row.score, row.max)
    return points === null
      ? []
      : [{ criterion_id: row.criterion_id, label: row.label, max_score: row.max, score: points }]
  })
  return {
    action,
    feedback: form.feedback,
    ...(score === null ? {} : { final_score: score }),
    ...(form.criteria.length > 0 ? { rubric_scores: { criteria } } : {}),
  }
}
