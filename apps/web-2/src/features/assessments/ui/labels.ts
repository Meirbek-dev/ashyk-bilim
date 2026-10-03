import { m } from '#/paraglide/messages'
import type {
  AccessMode,
  AssessmentDetail,
  AuditEventKind,
  EditLock,
  FormFieldType,
  GradeReleaseMode,
  GradingType,
  Lifecycle,
  ReadinessIssueCode,
  ReviewVisibility,
} from '#/shared/api/gen/types.gen'

import { can } from '../model/route'
import type { StatusTone } from '#/shared/components/status-badge'

import type { NewItemKind } from '../model/items'
import type { LateKind } from '../model/policy'

export const kindLabels: Record<NewItemKind, () => string> = {
  single_choice: m.assessments_kind_single_choice,
  multiple_choice: m.assessments_kind_multiple_choice,
  true_false: m.assessments_kind_true_false,
  matching: m.assessments_kind_matching,
  open_text: m.assessments_kind_open_text,
  form: m.assessments_kind_form,
  code: m.assessments_kind_code,
}

export const lifecycleBadges: Record<Lifecycle, { label: () => string; tone: StatusTone }> = {
  draft: { label: m.assessments_lifecycle_draft, tone: 'neutral' },
  scheduled: { label: m.assessments_lifecycle_scheduled, tone: 'info' },
  published: { label: m.assessments_lifecycle_published, tone: 'success' },
  archived: { label: m.assessments_lifecycle_archived, tone: 'warning' },
}

export const formTypeLabels: Record<FormFieldType, () => string> = {
  text: m.assessments_form_type_text,
  textarea: m.assessments_form_type_textarea,
  number: m.assessments_form_type_number,
  date: m.assessments_form_type_date,
}

export const gradingLabels: Record<GradingType, () => string> = {
  numeric: m.assessments_grading_numeric,
  percentage: m.assessments_grading_percentage,
}

export const lateLabels: Record<LateKind, () => string> = {
  none: m.assessments_late_none,
  penalty: m.assessments_late_penalty,
  cutoff: m.assessments_late_cutoff,
}

export const releaseLabels: Record<GradeReleaseMode, () => string> = {
  immediate: m.assessments_release_immediate,
  batch: m.assessments_release_batch,
}

export const reviewLabels: Record<ReviewVisibility, () => string> = {
  none: m.assessments_review_none,
  score_only: m.assessments_review_score_only,
  full: m.assessments_review_full,
}

export const accessLabels: Record<AccessMode, () => string> = {
  all_course_learners: m.assessments_access_all,
  restricted: m.assessments_access_restricted,
}

/** `{value, label}` options of a select or radio group from one of the maps above. */
export const optionsOf = <T extends string>(labels: Record<T, () => string>) =>
  Object.entries<() => string>(labels).map(([value, label]) => ({ value, label: label() }))

export const eventLabels: Record<AuditEventKind, () => string> = {
  'lifecycle-transition': m.assessments_event_lifecycle_transition,
  'auto-publish-skipped': m.assessments_event_auto_publish_skipped,
  'access-changed': m.assessments_event_access_changed,
  'override-created': m.assessments_event_override_created,
  'override-updated': m.assessments_event_override_updated,
  'override-deleted': m.assessments_event_override_deleted,
  'duplicated-from': m.assessments_event_duplicated_from,
  'deadline-extension-requested': m.assessments_event_deadline_extension_requested,
  'deadline-extended': m.assessments_event_deadline_extended,
  'submission-submitted': m.assessments_event_submission_submitted,
  'grade-saved': m.assessments_event_grade_saved,
  'grades-published': m.assessments_event_grades_published,
}

export const issueLabels: Record<ReadinessIssueCode, () => string> = {
  'assessment.title_missing': m.assessments_issue_assessment_title_missing,
  'assessment.empty': m.assessments_issue_assessment_empty,
  'schedule.after_due_at': m.assessments_issue_schedule_after_due_at,
  'policy.due_at_past': m.assessments_issue_policy_due_at_past,
  'policy.cutoff_before_due': m.assessments_issue_policy_cutoff_before_due,
  'policy.penalty_without_late': m.assessments_issue_policy_penalty_without_late,
  'item.kind_forbidden': m.assessments_issue_item_kind_forbidden,
  'item.title_missing': m.assessments_issue_item_title_missing,
  'item.max_score_invalid': m.assessments_issue_item_max_score_invalid,
  'choice.prompt_missing': m.assessments_issue_choice_prompt_missing,
  'choice.options_missing': m.assessments_issue_choice_options_missing,
  'choice.option_text_missing': m.assessments_issue_choice_option_text_missing,
  'choice.option_duplicate': m.assessments_issue_choice_option_duplicate,
  'choice.option_id_duplicate': m.assessments_issue_choice_option_id_duplicate,
  'choice.correct_missing': m.assessments_issue_choice_correct_missing,
  'choice.too_many_correct': m.assessments_issue_choice_too_many_correct,
  'open_text.prompt_missing': m.assessments_issue_open_text_prompt_missing,
  'open_text.min_words_invalid': m.assessments_issue_open_text_min_words_invalid,
  'form.prompt_missing': m.assessments_issue_form_prompt_missing,
  'form.fields_missing': m.assessments_issue_form_fields_missing,
  'form.field_label_missing': m.assessments_issue_form_field_label_missing,
  'form.field_id_duplicate': m.assessments_issue_form_field_id_duplicate,
  'code.prompt_missing': m.assessments_issue_code_prompt_missing,
  'code.languages_missing': m.assessments_issue_code_languages_missing,
  'code.tests_missing': m.assessments_issue_code_tests_missing,
  'code.test_io_missing': m.assessments_issue_code_test_io_missing,
  'code.test_weight_invalid': m.assessments_issue_code_test_weight_invalid,
  'matching.prompt_missing': m.assessments_issue_matching_prompt_missing,
  'matching.pairs_missing': m.assessments_issue_matching_pairs_missing,
  'matching.pair_value_missing': m.assessments_issue_matching_pair_value_missing,
  'matching.left_duplicate': m.assessments_issue_matching_left_duplicate,
  'matching.right_duplicate': m.assessments_issue_matching_right_duplicate,
}

/** Why the questions, name, basics and rules are read-only for an author (`edit_lock`). */
const lockLabels: Record<EditLock, () => string> = {
  archived: m.assessments_lock_archived,
  scheduled: m.assessments_lock_scheduled,
  has_submissions: m.assessments_lock_has_submissions,
}

/** Why the caller cannot edit the assessment now (B-ASM-11, B-ASM-28); null while it is editable (`edit`). */
export function lockReason(assessment: Pick<AssessmentDetail, 'allowed_actions' | 'edit_lock'>): string | null {
  if (can(assessment, 'edit')) return null
  return assessment.edit_lock && can(assessment, 'update')
    ? lockLabels[assessment.edit_lock]()
    : m.assessments_readonly()
}
