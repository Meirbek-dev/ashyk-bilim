import type { AssessmentDetail, AttemptState } from '@/lib/api/generated/zod'
import { unixToIso } from '@/lib/api/contract'
import type { AssessmentItem, ItemBody } from './items'
import type { PolicyView } from './policy'

const variants = {
  single_choice: 'SINGLE_CHOICE',
  multiple_choice: 'MULTIPLE_CHOICE',
  true_false: 'TRUE_FALSE',
} as const
const scoring = {
  partial_credit: 'PARTIAL_CREDIT',
  all_or_nothing: 'ALL_OR_NOTHING',
  best_submission: 'BEST_SUBMISSION',
  latest_submission: 'LATEST_SUBMISSION',
} as const
const matching = {
  exact: 'EXACT',
  trimmed: 'TRIMMED',
  ignore_whitespace: 'IGNORE_WHITESPACE',
  numeric_tolerance: 'NUMERIC_TOLERANCE',
  custom_checker: 'CUSTOM_CHECKER',
} as const
export const lifecycleFromWire = {
  draft: 'DRAFT',
  scheduled: 'SCHEDULED',
  published: 'PUBLISHED',
  archived: 'ARCHIVED',
} as const

export function itemFromWire(item: AssessmentDetail['items'][number]): AssessmentItem {
  const raw = item.body
  let body: ItemBody
  switch (raw.kind) {
    case 'choice': {
      body = {
        kind: 'CHOICE',
        prompt: raw.prompt ?? '',
        options: (raw.options ?? []).map(option => ({
          id: option.id,
          text: option.text ?? '',
          is_correct: option.is_correct ?? false,
        })),
        multiple: raw.multiple ?? false,
        variant: raw.variant ? variants[raw.variant] : null,
        explanation: raw.explanation ?? null,
      }
      break
    }
    case 'open_text': {
      body = {
        kind: 'OPEN_TEXT',
        prompt: raw.prompt ?? '',
        min_words: raw.min_words ?? null,
        rubric: raw.rubric ?? null,
      }
      break
    }
    case 'form': {
      body = {
        kind: 'FORM',
        prompt: raw.prompt ?? '',
        fields: (raw.fields ?? []).map(field => ({
          id: field.id,
          label: field.label ?? '',
          field_type: field.field_type ?? 'text',
          required: field.required ?? false,
        })),
      }
      break
    }
    case 'matching': {
      body = {
        kind: 'MATCHING',
        prompt: raw.prompt ?? '',
        pairs: raw.pairs ?? [],
        explanation: raw.explanation ?? null,
      }
      break
    }
    case 'code': {
      body = {
        kind: 'CODE',
        prompt: raw.prompt ?? '',
        input_spec: raw.input_spec ?? '',
        output_spec: raw.output_spec ?? '',
        constraints: raw.constraints ?? [],
        languages: raw.languages ?? [],
        starter_code: raw.starter_code ?? {},
        reference_solutions: raw.reference_solutions ?? {},
        tests: (raw.tests ?? []).map(test => ({
          id: test.id,
          input: test.input ?? '',
          expected_output: test.expected_output ?? '',
          is_visible: test.is_visible ?? false,
          weight: test.weight ?? 1,
          description: test.description ?? null,
          match_mode: matching[test.match_mode ?? 'exact'],
        })),
        time_limit_seconds: raw.time_limit_seconds ?? null,
        memory_limit_mb: raw.memory_limit_mb ?? null,
        max_output_kb: raw.max_output_kb ?? null,
        scoring_strategy: scoring[raw.scoring_strategy ?? 'partial_credit'],
      }
      break
    }
  }
  return {
    id: item.id,
    item_uuid: item.id,
    order: item.position,
    kind: body.kind,
    title: item.title,
    body,
    max_score: item.max_score,
    metadata: {
      difficulty: item.metadata.difficulty ?? null,
      estimated_minutes: item.metadata.estimated_minutes ?? null,
      section_label: item.metadata.section_label ?? null,
      outcome_ids: item.metadata.outcome_ids ?? [],
      tags: item.metadata.tags ?? [],
    },
  }
}

export function policyFromWire(policy: AssessmentDetail['policy'], effective?: AttemptState['effective']): PolicyView {
  const timing = effective ?? policy
  const visibility = { none: 'NONE', score_only: 'SCORE_ONLY', full: 'FULL' } as const
  return {
    dueAt: unixToIso(timing.due_at_unix),
    maxAttempts: timing.max_attempts ?? null,
    timeLimitSeconds: timing.time_limit_seconds ?? null,
    reviewVisibility: visibility[policy.review_visibility],
    resultReviewAllowed: policy.review_visibility !== 'none',
    correctAnswersVisible: policy.review_visibility === 'full',
    latePolicy: { penaltyPercent: timing.late_policy.kind === 'penalty' ? timing.late_policy.percent_per_day : 0 },
    antiCheat: {
      copyPasteProtection: policy.copy_paste_protection,
      tabSwitchDetection: policy.tab_switch_detection,
      devtoolsDetection: policy.devtools_detection,
      rightClickDisabled: policy.right_click_disabled,
      fullscreenEnforced: policy.fullscreen_required,
      violationThreshold: policy.violation_threshold,
    },
  }
}
