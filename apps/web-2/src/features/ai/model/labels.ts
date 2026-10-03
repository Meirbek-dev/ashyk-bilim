import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type {
  AiRunKind,
  AiRunStatus,
  CourseAnalysisStatus,
  FindingReviewAction,
  Level,
  RemediationStatus,
  RunEventState,
  StudyMode,
} from '#/shared/api/gen/types.gen'
import { vErrorCode } from '#/shared/api/gen/valibot.gen'
import { presentError } from '#/shared/i18n/errors'

import type { PanelTab } from '../route'
import { STREAM_LOST } from './run'

export const tabLabels: Record<PanelTab, () => string> = {
  chat: m.ai_tab_chat,
  study: m.ai_tab_study,
  critique: m.ai_tab_critique,
  remediation: m.ai_tab_remediation,
}

export const modeLabels: Record<StudyMode, () => string> = {
  explain: m.ai_mode_explain,
  practice: m.ai_mode_practice,
  flashcards: m.ai_mode_flashcards,
  summarize: m.ai_mode_summarize,
  deepen: m.ai_mode_deepen,
}

export const stepLabels: Record<RunEventState, () => string> = {
  queued: m.ai_step_queued,
  running: m.ai_step_running,
  collecting_context: m.ai_step_collecting_context,
  checking_evidence: m.ai_step_checking_evidence,
  complete: m.ai_step_complete,
  failed: m.ai_step_failed,
  cancelled: m.ai_step_cancelled,
}

export const levelLabels: Record<Level, () => string> = {
  low: m.ai_level_low,
  medium: m.ai_level_medium,
  high: m.ai_level_high,
}

export const analysisStatusLabels: Record<CourseAnalysisStatus, () => string> = {
  draft: m.ai_analysis_draft,
  needs_human_review: m.ai_analysis_needs_human_review,
  published: m.ai_analysis_published,
}

export const findingLabels: Record<FindingReviewAction, () => string> = {
  accepted: m.ai_finding_accepted,
  dismissed: m.ai_finding_dismissed,
  task_created: m.ai_finding_task_created,
}

export const sessionStatusLabels: Record<RemediationStatus, () => string> = {
  assigned: m.ai_remediation_assigned,
  in_progress: m.ai_remediation_in_progress,
  passed: m.ai_remediation_passed,
  failed: m.ai_remediation_failed,
}

export const runStatusLabels: Record<AiRunStatus, () => string> = {
  queued: m.ai_status_queued,
  running: m.ai_status_running,
  succeeded: m.ai_status_succeeded,
  failed: m.ai_status_failed,
  aborted: m.ai_status_aborted,
}

export const kindLabels: Record<AiRunKind, () => string> = {
  course_analysis: m.ai_kind_course_analysis,
  submission_analysis: m.ai_kind_submission_analysis,
  remediation: m.ai_kind_remediation,
  study_companion: m.ai_kind_study_companion,
  lecture_review: m.ai_kind_lecture_review,
  course_qa: m.ai_kind_course_qa,
}

// `FeatureSetting.key` is a plain string in the contract (`AiFeature` in `core/src/ai.rs`).
const featureLabels: Record<string, () => string> = {
  course_analysis_enabled: m.ai_feature_course_analysis,
  submission_analysis_enabled: m.ai_feature_submission_analysis,
  remediation_enabled: m.ai_feature_remediation,
  course_qa_enabled: m.ai_feature_course_qa,
  study_companion_enabled: m.ai_feature_study_companion,
  lecture_authoring_enabled: m.ai_feature_lecture_authoring,
  semantic_memory_enabled: m.ai_feature_semantic_memory,
}
/** An unknown key shows as itself. */
export const featureLabel = (key: string) => featureLabels[key]?.() ?? key

/**
 * The text of a run's or a turn's error code: an API error code (`ai-budget-exhausted`, `ai-disabled`...) reads as
 * its `presentError` text; a lost stream and the agents' own codes (`AI_RUN_FAILED`...) as one sentence each.
 */
export function runErrorText(code: string | null): string {
  if (code === STREAM_LOST) return m.ai_stream_lost()
  const known = v.safeParse(vErrorCode, code)
  if (!known.success) return m.ai_run_failed()
  return presentError(
    new ApiError({ status: 0, code: known.output, fieldErrors: [], requestId: null, retryAfter: null }),
  )
}
