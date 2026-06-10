import type { AssessmentItem, AssessmentItemMetadata, UnifiedItemKind } from '@/features/assessments/domain/items'
import type { ValidationIssue } from '@/features/assessments/domain/view-models'
import type { ChoiceAuthorValue } from '@/features/assessments/items/choice'
import type { AssessmentEditorState, EditableItem } from './studioTypes'

export type SupportedStudioItemKind = Exclude<UnifiedItemKind, 'CODE'>
export type StudioMode = 'exam'
export type AssessmentLifecycle = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'

export interface StudioReadinessPayload {
  issues: { code: string; message: string; item_uuid?: string | null }[]
}

export interface AssessmentPolicyDetail {
  due_at?: string | null
  max_attempts?: number | null
  time_limit_seconds?: number | null
  anti_cheat_json?: Record<string, unknown> | null
  late_policy_json?: Record<string, unknown> | null
  settings_json?: Record<string, unknown> | null
}

export interface AssessmentStudioDetail {
  assessment_uuid: string
  activity_uuid: string
  course_uuid?: string | null
  kind: 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ'
  title: string
  description: string
  lifecycle: AssessmentLifecycle
  grading_type: 'NUMERIC' | 'PERCENTAGE'
  items: AssessmentItem[]
  assessment_policy?: AssessmentPolicyDetail | null
}

export function buildDefaultItemPayload(kind: SupportedStudioItemKind, defaultTitle: string) {
  if (kind === 'CHOICE') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: {
        kind,
        prompt: '',
        options: [createChoiceOption(), createChoiceOption()],
        multiple: false,
        variant: 'SINGLE_CHOICE',
      },
    }
  }

  if (kind === 'MATCHING') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: {
        kind,
        prompt: '',
        pairs: [createMatchingPair()],
      },
    }
  }

  if (kind === 'FORM') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: {
        kind,
        prompt: '',
        fields: [createFormField()],
      },
    }
  }

  return {
    kind,
    title: defaultTitle,
    max_score: 1,
    body: {
      kind,
      prompt: '',
      min_words: null,
      rubric: null,
    },
  }
}

export function buildAssessmentPatch(
  _mode: StudioMode,
  assessment: AssessmentStudioDetail,
  state: AssessmentEditorState,
) {
  const dueAt = state.dueAt ? new Date(state.dueAt).toISOString() : null
  const payload: Record<string, unknown> = {
    title: state.title,
    description: state.description,
  }

  const settings = normalizeRecord(assessment.assessment_policy?.settings_json)
  payload.policy = {
    due_at: dueAt,
    max_attempts: state.maxAttempts ? Number(state.maxAttempts) : null,
    time_limit_seconds: state.timeLimitMinutes ? Number(state.timeLimitMinutes) * 60 : null,
    anti_cheat_json: {
      copy_paste_protection: state.copyPasteProtection,
      tab_switch_detection: state.tabSwitchDetection,
      devtools_detection: state.devtoolsDetection,
      right_click_disable: state.rightClickDisable,
      fullscreen_enforcement: state.fullscreenEnforcement,
      violation_threshold: state.violationThreshold ? Number(state.violationThreshold) : null,
    },
    settings_json: {
      ...settings,
      attempt_limit: state.maxAttempts ? Number(state.maxAttempts) : null,
      time_limit: state.timeLimitMinutes ? Number(state.timeLimitMinutes) : null,
      allow_result_review: state.allowResultReview,
      show_correct_answers: state.showCorrectAnswers,
      copy_paste_protection: state.copyPasteProtection,
      tab_switch_detection: state.tabSwitchDetection,
      devtools_detection: state.devtoolsDetection,
      right_click_disable: state.rightClickDisable,
      fullscreen_enforcement: state.fullscreenEnforcement,
      violation_threshold: state.violationThreshold ? Number(state.violationThreshold) : null,
      pass_threshold: state.passThreshold ? Number(state.passThreshold) : null,
      randomize_questions: state.randomizeQuestions,
      randomize_options: state.randomizeOptions,
      partial_credit: state.partialCredit,
      grace_period_minutes: state.gracePeriodMinutes ? Number(state.gracePeriodMinutes) : null,
      available_from: state.availableFrom ? new Date(state.availableFrom).toISOString() : null,
      negative_marking_percent: state.negativeMarkingPercent ? Number(state.negativeMarkingPercent) : 0,
    },
  }
  return payload
}

export function toAssessmentEditorState(assessment: AssessmentStudioDetail): AssessmentEditorState {
  const antiCheat = normalizeRecord(assessment.assessment_policy?.anti_cheat_json)
  const settings = normalizeRecord(assessment.assessment_policy?.settings_json)
  return {
    title: assessment.title,
    description: assessment.description ?? '',
    dueAt: toDateTimeLocal(assessment.assessment_policy?.due_at),
    gradingType: assessment.grading_type ?? 'PERCENTAGE',
    maxAttempts:
      typeof assessment.assessment_policy?.max_attempts === 'number'
        ? String(assessment.assessment_policy.max_attempts)
        : typeof settings.max_attempts === 'number'
          ? String(settings.max_attempts)
          : typeof settings.attempt_limit === 'number'
            ? String(settings.attempt_limit)
            : '1',
    timeLimitMinutes:
      typeof assessment.assessment_policy?.time_limit_seconds === 'number'
        ? String(Math.max(1, Math.ceil(assessment.assessment_policy.time_limit_seconds / 60)))
        : typeof settings.time_limit_seconds === 'number'
          ? String(Math.max(1, Math.ceil(settings.time_limit_seconds / 60)))
          : typeof settings.time_limit === 'number'
            ? String(settings.time_limit)
            : '',
    copyPasteProtection: antiCheat.copy_paste_protection === true || settings.copy_paste_protection === true,
    tabSwitchDetection: antiCheat.tab_switch_detection === true || settings.tab_switch_detection === true,
    devtoolsDetection: antiCheat.devtools_detection === true || settings.devtools_detection === true,
    rightClickDisable: antiCheat.right_click_disable === true || settings.right_click_disable === true,
    fullscreenEnforcement: antiCheat.fullscreen_enforcement === true || settings.fullscreen_enforcement === true,
    violationThreshold:
      typeof antiCheat.violation_threshold === 'number'
        ? String(antiCheat.violation_threshold)
        : typeof settings.violation_threshold === 'number'
          ? String(settings.violation_threshold)
          : '3',
    allowResultReview: settings.allow_result_review !== false,
    showCorrectAnswers:
      typeof settings.show_correct_answers === 'boolean'
        ? settings.show_correct_answers
        : settings.allow_result_review !== false,
    passThreshold: typeof settings.pass_threshold === 'number' ? String(settings.pass_threshold) : '',
    randomizeQuestions: settings.randomize_questions === true,
    randomizeOptions: settings.randomize_options === true,
    partialCredit: settings.partial_credit === true,
    gracePeriodMinutes: typeof settings.grace_period_minutes === 'number' ? String(settings.grace_period_minutes) : '',
    availableFrom: settings.available_from ? toDateTimeLocal(settings.available_from as string) : '',
    negativeMarkingPercent:
      typeof settings.negative_marking_percent === 'number' && settings.negative_marking_percent > 0
        ? String(settings.negative_marking_percent)
        : '',
  }
}

export function toEditableItem(item: AssessmentItem): EditableItem {
  return {
    item_uuid: item.item_uuid,
    kind: item.kind,
    title: item.title,
    max_score: item.max_score,
    body: structuredClone(item.body),
    metadata: defaultItemMetadata(item.metadata),
  }
}

export function toChoiceAuthorValue(
  body: Extract<EditableItem['body'], { kind: 'CHOICE' | 'MATCHING' }>,
): ChoiceAuthorValue {
  if (body.kind === 'MATCHING') {
    return {
      kind: 'MATCHING',
      prompt: body.prompt,
      pairs: body.pairs.map((pair, index) => ({
        id: `${index}`,
        left: pair.left,
        right: pair.right,
      })),
    }
  }

  return {
    kind: body.variant === 'TRUE_FALSE' ? 'TRUE_FALSE' : body.multiple ? 'CHOICE_MULTIPLE' : 'CHOICE_SINGLE',
    prompt: body.prompt,
    options: body.options.map(option => ({
      id: option.id,
      text: option.text,
      isCorrect: option.is_correct,
    })),
  }
}

export function fromChoiceAuthorValue(
  item: EditableItem,
  value: ChoiceAuthorValue,
): Pick<EditableItem, 'kind' | 'body'> {
  if (value.kind === 'MATCHING') {
    return {
      kind: 'MATCHING',
      body: {
        kind: 'MATCHING',
        prompt: value.prompt,
        pairs: value.pairs.map(pair => ({
          left: pair.left,
          right: pair.right,
        })),
        explanation: item.body.kind === 'MATCHING' ? (item.body.explanation ?? null) : null,
      },
    }
  }

  return {
    kind: 'CHOICE',
    body: {
      kind: 'CHOICE',
      prompt: value.prompt,
      options: value.options.map(option => ({
        id: String(option.id),
        text: option.text,
        is_correct: option.isCorrect === true,
      })),
      multiple: value.kind === 'CHOICE_MULTIPLE',
      variant:
        value.kind === 'TRUE_FALSE'
          ? 'TRUE_FALSE'
          : value.kind === 'CHOICE_MULTIPLE'
            ? 'MULTIPLE_CHOICE'
            : 'SINGLE_CHOICE',
      explanation: item.body.kind === 'CHOICE' ? (item.body.explanation ?? null) : null,
    },
  }
}

export function getAssessmentEditorIssues(
  mode: StudioMode,
  state: AssessmentEditorState,
  t: AppTranslator,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!state.title.trim()) {
    issues.push({
      code: 'assessment.title_missing',
      message: t('validation.assessment_title_missing'),
    })
  }

  if (mode === 'exam') {
    if (state.maxAttempts && Number(state.maxAttempts) < 1) {
      issues.push({
        code: 'policy.max_attempts_invalid',
        message: t('validation.policy_max_attempts_invalid'),
        field: 'maxAttempts',
      })
    }
    if (state.timeLimitMinutes && Number(state.timeLimitMinutes) < 1) {
      issues.push({
        code: 'policy.time_limit_invalid',
        message: t('validation.policy_time_limit_invalid'),
        field: 'timeLimitMinutes',
      })
    }
    if (state.violationThreshold && Number(state.violationThreshold) < 1) {
      issues.push({
        code: 'policy.violation_threshold_invalid',
        message: t('validation.policy_violation_threshold_invalid'),
        field: 'violationThreshold',
      })
    }
  }

  return issues
}

export function createChoiceOption() {
  return {
    id: `option_${crypto.randomUUID()}`,
    text: '',
    is_correct: false,
  }
}

export function createMatchingPair() {
  return {
    left: '',
    right: '',
  }
}

export function createFormField() {
  return {
    id: `field_${crypto.randomUUID()}`,
    label: '',
    field_type: 'text' as const,
    required: false,
  }
}

export function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function serializeAssessmentState(state: AssessmentEditorState) {
  return JSON.stringify(state)
}

export function serializeItemState(item: EditableItem) {
  return JSON.stringify(item)
}

export function defaultItemMetadata(metadata: AssessmentItem['metadata'] | null | undefined): AssessmentItemMetadata {
  return {
    section_label: metadata?.section_label ?? null,
    difficulty: metadata?.difficulty ?? null,
    tags: metadata?.tags ?? [],
    outcome_ids: metadata?.outcome_ids ?? [],
    estimated_minutes: metadata?.estimated_minutes ?? null,
  }
}

export function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null)
  const detail = payload && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : null
  if (typeof detail === 'string' && detail) return detail
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    return detail.message
  }
  return fallback
}
