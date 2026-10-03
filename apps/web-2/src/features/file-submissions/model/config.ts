import * as v from 'valibot'

import type { ConfigPatch, FileRubric, FileSubmission, LatePolicy } from '#/shared/api/gen/types.gen'
import { vRubricLevel } from '#/shared/api/gen/valibot.gen'
import { fromDateTimeInput, toDateTimeInput } from '#/shared/i18n/format'

import { tickedGroups, TYPE_GROUP_KEYS, typesOf } from './types'

// The studio's forms keep numbers and dates as typed text (a blank field means "no limit" / "no deadline") and turn
// into a `ConfigPatch` on save. Ranges are the server's (it answers 422 per field); only the shape is checked here.

const whole = v.pipe(v.string(), v.trim(), v.regex(/^\d+$/))
const wholeOrBlank = v.pipe(v.string(), v.trim(), v.regex(/^\d*$/))
const DECIMAL = /^\d+([.,]\d+)?$/
const DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/

const text = (value: number | null) => (value === null ? '' : String(value))
const numberOf = (value: string) => Number(value.trim().replace(',', '.'))
const blankNull = (value: string) => (value.trim() === '' ? null : numberOf(value))
const dateText = (unix: number | null) => (unix === null ? '' : toDateTimeInput(unix))

// ---- Files (B-FSB-16) ----

export const filesSchema = v.object({
  max_files: whole,
  max_file_size_mb: wholeOrBlank,
  types: v.record(v.picklist(TYPE_GROUP_KEYS), v.boolean()),
})
export type FilesForm = v.InferOutput<typeof filesSchema>

export const filesForm = (task: FileSubmission): FilesForm => ({
  max_files: String(task.max_files),
  max_file_size_mb: text(task.max_file_size_mb),
  types: tickedGroups(task.allowed_mime_types),
})

export const filesPatch = (form: FilesForm, task: FileSubmission): ConfigPatch => ({
  max_files: numberOf(form.max_files),
  max_file_size_mb: blankNull(form.max_file_size_mb),
  allowed_mime_types: typesOf(form.types, task.allowed_mime_types),
})

// ---- Deadlines, late work, attempts, grade release (B-FSB-17) ----

export const LATE_KINDS = ['none', 'penalty', 'cutoff'] as const satisfies readonly LatePolicy['kind'][]
export const RELEASE_MODES = ['immediate', 'batch'] as const

const deadlinesObject = v.object({
  due_at: v.pipe(v.string(), v.regex(DATE_TIME)),
  allow_late: v.boolean(),
  late_policy: v.object({
    kind: v.picklist(LATE_KINDS),
    percent_per_day: v.string(),
    max_days: v.string(),
    cutoff_at: v.pipe(v.string(), v.regex(DATE_TIME)),
  }),
  max_attempts: wholeOrBlank,
  grade_release_mode: v.picklist(RELEASE_MODES),
})
type LateKey = 'percent_per_day' | 'max_days' | 'cutoff_at'
/** A field of the chosen late rule must be filled in (the other rules' fields are ignored). */
const filled =
  (kind: LatePolicy['kind'], key: LateKey, pattern: RegExp) => (form: v.InferOutput<typeof deadlinesObject>) =>
    form.late_policy.kind !== kind || pattern.test(form.late_policy[key].trim())

export const deadlinesSchema = v.pipe(
  deadlinesObject,
  v.forward(v.check(filled('penalty', 'percent_per_day', DECIMAL)), ['late_policy', 'percent_per_day']),
  v.forward(v.check(filled('penalty', 'max_days', /^\d+$/)), ['late_policy', 'max_days']),
  v.forward(v.check(filled('cutoff', 'cutoff_at', /./)), ['late_policy', 'cutoff_at']),
)
export type DeadlinesForm = v.InferOutput<typeof deadlinesSchema>

export function deadlinesForm(task: FileSubmission): DeadlinesForm {
  const policy = task.late_policy
  return {
    due_at: dateText(task.due_at_unix),
    allow_late: task.allow_late,
    late_policy: {
      kind: policy.kind,
      percent_per_day: policy.kind === 'penalty' ? String(policy.percent_per_day) : '',
      max_days: policy.kind === 'penalty' ? String(policy.max_days) : '',
      cutoff_at: policy.kind === 'cutoff' ? dateText(policy.cutoff_at_unix) : '',
    },
    max_attempts: text(task.max_attempts),
    grade_release_mode: task.grade_release_mode,
  }
}

function latePolicy({ late_policy: form }: DeadlinesForm): LatePolicy {
  if (form.kind === 'penalty')
    return { kind: 'penalty', percent_per_day: numberOf(form.percent_per_day), max_days: numberOf(form.max_days) }
  if (form.kind === 'cutoff') return { kind: 'cutoff', cutoff_at_unix: fromDateTimeInput(form.cutoff_at) }
  return { kind: 'none' }
}

export const deadlinesPatch = (form: DeadlinesForm): ConfigPatch => ({
  due_at_unix: form.due_at ? fromDateTimeInput(form.due_at) : null,
  allow_late: form.allow_late,
  late_policy: latePolicy(form),
  max_attempts: blankNull(form.max_attempts),
  grade_release_mode: form.grade_release_mode,
})

// ---- Rubric (B-FSB-15) ----

export const rubricSchema = v.object({
  criteria: v.array(
    v.object({
      criterion_id: v.string(),
      label: v.pipe(v.string(), v.trim(), v.minLength(1)),
      max_score: v.pipe(v.string(), v.trim(), v.regex(DECIMAL)),
      // Levels of old rubrics ride along untouched: their editor is the grader's (slice 6.1).
      levels: v.optional(v.array(vRubricLevel)),
    }),
  ),
})
export type RubricForm = v.InferOutput<typeof rubricSchema>
export type CriterionForm = RubricForm['criteria'][number]

export const rubricForm = (rubric: FileRubric): RubricForm => ({
  criteria: (rubric.criteria ?? []).map(criterion => ({ ...criterion, max_score: String(criterion.max_score) })),
})

export const newCriterion = (): CriterionForm => ({ criterion_id: crypto.randomUUID(), label: '', max_score: '' })

/** No criteria is the server's "no rubric" (`{}`). */
export function rubricPatch(form: RubricForm): ConfigPatch {
  if (form.criteria.length === 0) return { rubric: {} }
  const criteria = form.criteria.map(({ levels, ...criterion }) => ({
    ...criterion,
    label: criterion.label.trim(),
    max_score: numberOf(criterion.max_score),
    ...(levels ? { levels } : {}),
  }))
  return { rubric: { criteria } }
}
