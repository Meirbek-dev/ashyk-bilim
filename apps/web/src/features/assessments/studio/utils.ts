import type { AssessmentItem, AssessmentItemMetadata, UnifiedItemKind } from '@/features/assessments/domain/items'
import type { ValidationIssue } from '@/features/assessments/domain/view-models'
import type { ChoiceAuthorValue } from '@/features/assessments/items/choice'
import type {
  AssessmentEditorState,
  AssessmentWorkspaceView,
  EditableItem,
  WorkspaceReadinessIssue,
} from './studioTypes'

export type SupportedStudioItemKind = Exclude<UnifiedItemKind, 'CODE'>
export type StudioMode = 'exam'
export type AssessmentLifecycle = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'

export interface StudioReadinessPayload {
  issues: {
    code: string
    message: string
    item_uuid?: string | null
    severity?: 'blocker' | 'warning' | 'advice' | 'audit'
    area?: 'details' | 'questions' | 'policy' | 'audience' | 'results' | 'publish' | 'system'
    view?: 'settings' | 'questions' | 'audience' | 'results' | 'publish'
    field?: string | null
    why?: string | null
    action_label?: string | null
  }[]
  blocker_count?: number
  warning_count?: number
  contract_version?: number
}

export interface AssessmentPolicyDetail {
  canonical_policy?: AssessmentCanonicalPolicyDetail | null
}

export interface AssessmentCanonicalPolicyDetail {
  due_at?: string | null
  max_attempts?: number | null
  time_limit_seconds?: number | null
  passing_score?: number | null
  review_visibility?: 'NONE' | 'SCORE_ONLY' | 'FULL' | null
  integrity?: {
    copy_paste_protection?: boolean | null
    tab_switch_detection?: boolean | null
    devtools_detection?: boolean | null
    right_click_disabled?: boolean | null
    fullscreen_required?: boolean | null
    violation_threshold?: number | null
  } | null
  delivery?: {
    randomize_questions?: boolean | null
    randomize_options?: boolean | null
    partial_credit?: boolean | null
    negative_marking_percent?: number | null
  } | null
}

export interface AssessmentStudioDetail {
  assessment_uuid: string
  activity_uuid: string
  course_uuid?: string | null
  kind: 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ'
  title: string
  description: string
  lifecycle: AssessmentLifecycle
  scheduled_at?: string | null
  published_at?: string | null
  archived_at?: string | null
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
  _assessment: AssessmentStudioDetail,
  state: AssessmentEditorState,
) {
  const dueAt = state.dueAt ? new Date(state.dueAt).toISOString() : null
  const payload: Record<string, unknown> = {
    title: state.title,
    description: state.description,
  }

  payload.policy = {
    due_at: dueAt,
    max_attempts: state.maxAttempts ? Number(state.maxAttempts) : null,
    time_limit_seconds: state.timeLimitMinutes ? Number(state.timeLimitMinutes) * 60 : null,
    passing_score: state.passThreshold ? Number(state.passThreshold) : null,
    review_visibility: reviewVisibilityForState(state),
    randomize_questions: state.randomizeQuestions,
    randomize_options: state.randomizeOptions,
    partial_credit: state.partialCredit,
    negative_marking_percent: state.negativeMarkingPercent ? Number(state.negativeMarkingPercent) : 0,
    grace_period_minutes: state.gracePeriodMinutes ? Number(state.gracePeriodMinutes) : null,
    copy_paste_protection: state.copyPasteProtection,
    tab_switch_detection: state.tabSwitchDetection,
    devtools_detection: state.devtoolsDetection,
    right_click_disabled: state.rightClickDisable,
    fullscreen_required: state.fullscreenEnforcement,
    violation_threshold: state.violationThreshold ? Number(state.violationThreshold) : null,
  }
  return payload
}

export function toAssessmentEditorState(assessment: AssessmentStudioDetail): AssessmentEditorState {
  const canonical = assessment.assessment_policy?.canonical_policy
  const canonicalIntegrity = canonical?.integrity
  const canonicalDelivery = canonical?.delivery
  const dueAt = canonical?.due_at
  const maxAttempts = canonical?.max_attempts
  const timeLimitSeconds = canonical?.time_limit_seconds
  const reviewVisibility = canonical?.review_visibility
  return {
    title: assessment.title,
    description: assessment.description ?? '',
    dueAt: toDateTimeLocal(dueAt),
    gradingType: assessment.grading_type ?? 'PERCENTAGE',
    maxAttempts: typeof maxAttempts === 'number' ? String(maxAttempts) : '1',
    timeLimitMinutes: typeof timeLimitSeconds === 'number' ? String(Math.max(1, Math.ceil(timeLimitSeconds / 60))) : '',
    copyPasteProtection: canonicalIntegrity?.copy_paste_protection === true,
    tabSwitchDetection: canonicalIntegrity?.tab_switch_detection === true,
    devtoolsDetection: canonicalIntegrity?.devtools_detection === true,
    rightClickDisable: canonicalIntegrity?.right_click_disabled === true,
    fullscreenEnforcement: canonicalIntegrity?.fullscreen_required === true,
    violationThreshold:
      typeof canonicalIntegrity?.violation_threshold === 'number'
        ? String(canonicalIntegrity.violation_threshold)
        : '3',
    allowResultReview: reviewVisibility !== 'NONE',
    showCorrectAnswers: reviewVisibility !== 'SCORE_ONLY' && reviewVisibility !== 'NONE',
    passThreshold: typeof canonical?.passing_score === 'number' ? String(canonical.passing_score) : '',
    randomizeQuestions: canonicalDelivery?.randomize_questions === true,
    randomizeOptions: canonicalDelivery?.randomize_options === true,
    partialCredit: canonicalDelivery?.partial_credit === true,
    gracePeriodMinutes: '',
    availableFrom: '',
    negativeMarkingPercent:
      typeof canonicalDelivery?.negative_marking_percent === 'number' && canonicalDelivery.negative_marking_percent > 0
        ? String(canonicalDelivery.negative_marking_percent)
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

export function toWorkspaceReadinessIssues(payload: StudioReadinessPayload | undefined): WorkspaceReadinessIssue[] {
  return (payload?.issues ?? []).map(issue => {
    const mapped: WorkspaceReadinessIssue = {
      code: issue.code,
      message: issue.message,
      severity: issue.severity ?? 'blocker',
      area: issue.area ?? 'publish',
      view: readinessViewToWorkspaceView(issue.view),
    }
    if (issue.item_uuid) mapped.itemUuid = issue.item_uuid
    if (issue.field) mapped.field = issue.field
    if (issue.why) mapped.why = issue.why
    if (issue.action_label) mapped.actionLabel = issue.action_label
    return mapped
  })
}

export function readinessViewToWorkspaceView(
  view: StudioReadinessPayload['issues'][number]['view'],
): AssessmentWorkspaceView {
  if (view === 'settings') return 'SETUP'
  if (view === 'questions') return 'BUILDER'
  if (view === 'audience') return 'ACCESS'
  if (view === 'results') return 'RESULTS'
  return 'PUBLISH'
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

function reviewVisibilityForState(state: AssessmentEditorState) {
  if (!state.allowResultReview) return 'NONE'
  return state.showCorrectAnswers ? 'FULL' : 'SCORE_ONLY'
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
