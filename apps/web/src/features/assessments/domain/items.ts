export type UnifiedItemKind = 'CHOICE' | 'OPEN_TEXT' | 'FORM' | 'CODE' | 'MATCHING'

/**
 * The one item-kind → catalog-key map. Labels live under
 * `Features.Assessments.Studio.NativeItemStudio.kindLabels.<key>`; every surface
 * (studio outline, canvas, publish breakdown, grading inspector) resolves through it.
 */
export const ITEM_KIND_LABEL_KEYS: Record<UnifiedItemKind, string> = {
  CHOICE: 'choice',
  OPEN_TEXT: 'openText',
  FORM: 'form',
  MATCHING: 'matching',
  CODE: 'code',
}

export function itemKindLabelKey(kind: string): string | undefined {
  return ITEM_KIND_LABEL_KEYS[kind as UnifiedItemKind]
}

export interface ChoiceOption {
  id: string
  text: string
  is_correct: boolean
}

export interface MatchPair {
  left: string
  right: string
}

/** One column entry of the learner's matching read; `id` is what the answer carries. */
export interface MatchOption {
  id: string
  text: string
}

export interface FormField {
  id: string
  label: string
  field_type: 'text' | 'textarea' | 'number' | 'date'
  required: boolean
}

export interface CodeTestCase {
  id: string
  input: string
  expected_output: string
  is_visible: boolean
  weight: number
  description?: string | null
  match_mode?: 'EXACT' | 'TRIMMED' | 'IGNORE_WHITESPACE' | 'NUMERIC_TOLERANCE' | 'CUSTOM_CHECKER'
}

export type ItemBody =
  | {
      kind: 'CHOICE'
      prompt: string
      options: ChoiceOption[]
      multiple: boolean
      variant?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | null
      explanation?: string | null
    }
  | {
      kind: 'OPEN_TEXT'
      prompt: string
      min_words?: number | null
      rubric?: string | null
    }
  | { kind: 'FORM'; prompt: string; fields: FormField[] }
  | {
      kind: 'CODE'
      prompt: string
      input_spec?: string
      output_spec?: string
      constraints?: string[]
      languages: number[]
      starter_code: Record<string, string>
      reference_solutions?: Record<string, string>
      tests: CodeTestCase[]
      time_limit_seconds?: number | null
      memory_limit_mb?: number | null
      max_output_kb?: number | null
      scoring_strategy?: 'PARTIAL_CREDIT' | 'ALL_OR_NOTHING' | 'BEST_SUBMISSION' | 'LATEST_SUBMISSION'
    }
  | {
      kind: 'MATCHING'
      prompt: string
      /** The author's key; empty on the learner read. */
      pairs: MatchPair[]
      /** The learner read (`MatchingLearnerBody`): both columns, right one shuffled. */
      left?: MatchOption[]
      right?: MatchOption[]
      explanation?: string | null
    }

/**
 * The columns a matching attempt renders: the learner read's (`left`/`right`,
 * right shuffled by the server) or, for authors previewing, the pairs' texts.
 */
export function matchingColumns(body: {
  pairs: MatchPair[]
  left?: MatchOption[]
  right?: MatchOption[]
}): { left: MatchOption[]; right: MatchOption[] } {
  if (body.left && body.right) return { left: body.left, right: body.right }
  return {
    left: body.pairs.map(p => ({ id: p.left, text: p.left })),
    right: body.pairs.map(p => ({ id: p.right, text: p.right })),
  }
}

export interface AssessmentItemMetadata {
  section_label?: string | null
  difficulty?: 'easy' | 'medium' | 'hard' | null
  tags: string[]
  outcome_ids: string[]
  estimated_minutes?: number | null
}

export type ItemAnswer =
  | { kind: 'CHOICE'; selected: string[] }
  | { kind: 'OPEN_TEXT'; text: string }
  | { kind: 'FORM'; values: Record<string, string> }
  | {
      kind: 'CODE'
      language: number
      source: string
      latest_run?: {
        passed: number
        total: number
        score?: number
        details?: Record<string, unknown>[]
      }
    }
  | { kind: 'MATCHING'; matches: MatchPair[] }

export interface AssessmentItem {
  id: string
  item_uuid: string
  order: number
  kind: UnifiedItemKind
  title: string
  body: ItemBody
  metadata?: AssessmentItemMetadata
  max_score: number
  created_at?: string
  updated_at?: string
}

export function isAnswered(answer: ItemAnswer | null | undefined): boolean {
  if (!answer) return false
  switch (answer.kind) {
    case 'CHOICE': {
      return answer.selected.length > 0
    }
    case 'OPEN_TEXT': {
      return answer.text.trim().length > 0
    }
    case 'FORM': {
      return Object.values(answer.values).some(value => value.trim().length > 0)
    }
    case 'CODE': {
      return answer.source.trim().length > 0
    }
    case 'MATCHING': {
      return answer.matches.length > 0
    }
  }
}
