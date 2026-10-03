import * as v from 'valibot'

import type { AssessmentKind, GradeReleaseMode, LatePolicy, Policy, ReviewVisibility } from '#/shared/api/gen/types.gen'
import { fromDateTimeInput, toDateTimeInput } from '#/shared/i18n/format'

// The "Rules" form: the policy block as typed text (numbers, minutes, platform-zone dates) and back. The PUT replaces
// the whole block, so what the form does not show goes back as it was. Ranges are the server's (422 per field).

export type LateKind = LatePolicy['kind']

export type PolicyForm = {
  max_attempts: string
  time_limit_minutes: string
  due_at: string
  allow_late: boolean
  late_kind: LateKind
  percent_per_day: string
  max_days: string
  cutoff_at: string
  grace_period_minutes: string
  passing_score: string
  randomize_questions: boolean
  randomize_options: boolean
  partial_credit: boolean
  negative_marking_percent: string
  grade_release_mode: GradeReleaseMode
  review_visibility: ReviewVisibility
  required: boolean
  copy_paste_protection: boolean
  tab_switch_detection: boolean
  devtools_detection: boolean
  right_click_disabled: boolean
  fullscreen_required: boolean
  violation_threshold: string
}

/** Anti-cheat belongs to exams (spec 11); a quiz or a challenge keeps the stored values untouched. */
export const hasAntiCheat = (kind: AssessmentKind): boolean => kind === 'exam'

const text = (value: number | null): string => (value === null ? '' : String(value))
const date = (unix: number | null): string => (unix === null ? '' : toDateTimeInput(unix))

export function policyForm(policy: Policy): PolicyForm {
  const late = policy.late_policy
  return {
    max_attempts: text(policy.max_attempts),
    time_limit_minutes: policy.time_limit_seconds === null ? '' : String(Math.ceil(policy.time_limit_seconds / 60)),
    due_at: date(policy.due_at_unix),
    allow_late: policy.allow_late,
    late_kind: late.kind,
    percent_per_day: late.kind === 'penalty' ? String(late.percent_per_day) : '',
    max_days: late.kind === 'penalty' ? String(late.max_days) : '',
    cutoff_at: late.kind === 'cutoff' ? date(late.cutoff_at_unix) : '',
    grace_period_minutes: String(policy.grace_period_minutes),
    passing_score: String(policy.passing_score),
    randomize_questions: policy.randomize_questions,
    randomize_options: policy.randomize_options,
    partial_credit: policy.partial_credit,
    negative_marking_percent: String(policy.negative_marking_percent),
    grade_release_mode: policy.grade_release_mode,
    review_visibility: policy.review_visibility,
    required: policy.required,
    copy_paste_protection: policy.copy_paste_protection,
    tab_switch_detection: policy.tab_switch_detection,
    devtools_detection: policy.devtools_detection,
    right_click_disabled: policy.right_click_disabled,
    fullscreen_required: policy.fullscreen_required,
    violation_threshold: String(policy.violation_threshold),
  }
}

const decimal = (value: string): number => Number(value.trim().replace(',', '.'))
const optionalNumber = (value: string): number | null => (value.trim() === '' ? null : decimal(value))

function latePolicy(form: PolicyForm): LatePolicy {
  if (form.late_kind === 'penalty')
    return { kind: 'penalty', percent_per_day: decimal(form.percent_per_day), max_days: decimal(form.max_days) }
  if (form.late_kind === 'cutoff') return { kind: 'cutoff', cutoff_at_unix: fromDateTimeInput(form.cutoff_at) ?? 0 }
  return { kind: 'none' }
}

/** The PUT body: the form over the stored policy (fields the form does not show, and anti-cheat off an exam). */
export function policyBody(form: PolicyForm, stored: Policy, kind: AssessmentKind): Policy {
  const minutes = optionalNumber(form.time_limit_minutes)
  const antiCheat = hasAntiCheat(kind)
    ? {
        copy_paste_protection: form.copy_paste_protection,
        tab_switch_detection: form.tab_switch_detection,
        devtools_detection: form.devtools_detection,
        right_click_disabled: form.right_click_disabled,
        fullscreen_required: form.fullscreen_required,
        violation_threshold: decimal(form.violation_threshold),
      }
    : {}
  return {
    ...stored,
    max_attempts: optionalNumber(form.max_attempts),
    time_limit_seconds: minutes === null ? null : Math.round(minutes * 60),
    due_at_unix: fromDateTimeInput(form.due_at),
    allow_late: form.allow_late,
    late_policy: latePolicy(form),
    grace_period_minutes: decimal(form.grace_period_minutes),
    passing_score: decimal(form.passing_score),
    randomize_questions: form.randomize_questions,
    randomize_options: form.randomize_options,
    partial_credit: form.partial_credit,
    negative_marking_percent: decimal(form.negative_marking_percent),
    grade_release_mode: form.grade_release_mode,
    review_visibility: form.review_visibility,
    required: form.required,
    ...antiCheat,
  }
}

// UI parsing only (number fields are typed text); ranges stay with the server.
const whole = v.pipe(v.string(), v.trim(), v.regex(/^\d+$/u))
const optionalWhole = v.pipe(v.string(), v.trim(), v.regex(/^\d*$/u))
const number = v.pipe(v.string(), v.trim(), v.regex(/^\d+([.,]\d+)?$/u))
const optionalNumberText = v.pipe(v.string(), v.trim(), v.regex(/^(\d+([.,]\d+)?)?$/u))
const moment = v.pipe(
  v.string(),
  v.check(value => value === '' || fromDateTimeInput(value) !== null),
)

/** The form's schema; a late policy needs its own fields filled. */
export const policyFormSchema = v.pipe(
  v.object({
    max_attempts: optionalWhole,
    time_limit_minutes: optionalNumberText,
    due_at: moment,
    allow_late: v.boolean(),
    late_kind: v.picklist(['none', 'penalty', 'cutoff']),
    percent_per_day: optionalNumberText,
    max_days: optionalWhole,
    cutoff_at: moment,
    grace_period_minutes: whole,
    passing_score: number,
    randomize_questions: v.boolean(),
    randomize_options: v.boolean(),
    partial_credit: v.boolean(),
    negative_marking_percent: number,
    grade_release_mode: v.picklist(['immediate', 'batch']),
    review_visibility: v.picklist(['none', 'score_only', 'full']),
    required: v.boolean(),
    copy_paste_protection: v.boolean(),
    tab_switch_detection: v.boolean(),
    devtools_detection: v.boolean(),
    right_click_disabled: v.boolean(),
    fullscreen_required: v.boolean(),
    violation_threshold: whole,
  }),
  v.forward(
    v.partialCheck(
      [['late_kind'], ['percent_per_day']],
      form => form.late_kind !== 'penalty' || form.percent_per_day.trim() !== '',
    ),
    ['percent_per_day'],
  ),
  v.forward(
    v.partialCheck([['late_kind'], ['max_days']], form => form.late_kind !== 'penalty' || form.max_days.trim() !== ''),
    ['max_days'],
  ),
  v.forward(
    v.partialCheck([['late_kind'], ['cutoff_at']], form => form.late_kind !== 'cutoff' || form.cutoff_at !== ''),
    ['cutoff_at'],
  ),
)
