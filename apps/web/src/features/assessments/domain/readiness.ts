import type { AssessmentItem } from './items'
import type { ValidationIssue } from './view-models'

export type ValidationSeverity = 'blocker' | 'advisory'
export type ValidationArea =
  | 'assessment-metadata'
  | 'assessment-policy'
  | 'item-metadata'
  | 'item-content'
  | 'item-kind'

export interface ClassifiedValidationIssue extends ValidationIssue {
  severity: ValidationSeverity
  area: ValidationArea
  field?: string
}

export function classifyValidationIssue(issue: ValidationIssue): ClassifiedValidationIssue {
  if (issue.code.startsWith('assessment.')) {
    const isEmptyAssessment = issue.code === 'assessment.empty'
    return {
      ...issue,
      severity: 'blocker',
      area: isEmptyAssessment ? 'item-content' : 'assessment-metadata',
      ...(isEmptyAssessment
        ? { field: issue.field ?? 'items' }
        : issue.code === 'assessment.title_missing'
          ? { field: issue.field ?? 'title' }
          : {}),
    }
  }

  if (issue.code.startsWith('policy.') || issue.code.startsWith('schedule.')) {
    return {
      ...issue,
      severity: 'blocker',
      area: 'assessment-policy',
      ...(issue.code === 'policy.max_attempts_invalid'
        ? { field: 'maxAttempts' }
        : issue.code === 'policy.time_limit_invalid'
          ? { field: 'timeLimitMinutes' }
          : issue.code === 'policy.violation_threshold_invalid'
            ? { field: 'violationThreshold' }
            : issue.code === 'schedule.after_due_at'
              ? { field: 'dueAt' }
              : {}),
    }
  }

  if (issue.code === 'item.title_missing' || issue.code === 'item.max_score_invalid') {
    return {
      ...issue,
      severity: 'blocker',
      area: 'item-metadata',
      field: issue.field ?? (issue.code === 'item.title_missing' ? 'title' : 'max_score'),
    }
  }

  if (issue.code === 'item.kind_forbidden') {
    return {
      ...issue,
      severity: 'blocker',
      area: 'item-kind',
    }
  }

  return {
    ...issue,
    severity: 'blocker',
    area: 'item-content',
    field: issue.field ?? readinessFieldForIssueCode(issue.code),
  }
}

export function issuesForArea(
  issues: ValidationIssue[],
  area: ValidationArea,
  itemUuid?: string | null,
): ClassifiedValidationIssue[] {
  return issues
    .filter(issue => (itemUuid ? issue.itemUuid === itemUuid : !issue.itemUuid))
    .map(classifyValidationIssue)
    .filter(issue => issue.area === area)
}

export function itemIssues(
  issues: ValidationIssue[],
  itemUuid: string | null | undefined,
): ClassifiedValidationIssue[] {
  if (!itemUuid) return []
  return issues.filter(issue => issue.itemUuid === itemUuid).map(classifyValidationIssue)
}

export function localItemValidationIssues(
  item: Pick<AssessmentItem, 'item_uuid' | 'kind' | 'title' | 'max_score' | 'body'>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!item.title.trim()) {
      issues.push({
        code: 'item.title_missing',
        message: 'Item title is required.',
        itemUuid: item.item_uuid,
        field: 'title',
      })
  }
  if (!Number.isFinite(item.max_score) || item.max_score <= 0) {
      issues.push({
        code: 'item.max_score_invalid',
        message: 'Item points must be greater than zero.',
        itemUuid: item.item_uuid,
        field: 'max_score',
      })
  }

  if (item.body.kind === 'CHOICE') {
    if (!item.body.prompt.trim()) {
      issues.push({
        code: 'choice.prompt_missing',
        message: 'Choice prompt is required.',
        itemUuid: item.item_uuid,
        field: 'prompt',
      })
    }
    if (item.body.options.length < 2) {
      issues.push({
        code: 'choice.options_missing',
        message: 'Choice items need at least two options.',
        itemUuid: item.item_uuid,
        field: 'options',
      })
    }
    const normalizedOptions = item.body.options.map(option => option.text.trim()).filter(Boolean)
    if (item.body.options.some(option => !option.text.trim())) {
      issues.push({
        code: 'choice.option_text_missing',
        message: 'Every option needs visible text.',
        itemUuid: item.item_uuid,
        field: 'options',
      })
    }
    if (new Set(normalizedOptions.map(option => option.toLowerCase())).size !== normalizedOptions.length) {
      issues.push({
        code: 'choice.option_duplicate',
        message: 'Choice options should be unique.',
        itemUuid: item.item_uuid,
        field: 'options',
      })
    }
    const correctCount = item.body.options.filter(option => option.is_correct).length
    if (correctCount === 0) {
      issues.push({
        code: 'choice.correct_missing',
        message: 'Mark at least one correct choice.',
        itemUuid: item.item_uuid,
        field: 'correct_options',
      })
    }
    if (!item.body.multiple && correctCount > 1) {
      issues.push({
        code: 'choice.too_many_correct',
        message: 'Single-choice items can only have one correct option.',
        itemUuid: item.item_uuid,
        field: 'correct_options',
      })
    }
  }

  if (item.body.kind === 'MATCHING') {
    if (!item.body.prompt.trim()) {
      issues.push({
        code: 'matching.prompt_missing',
        message: 'Matching prompt is required.',
        itemUuid: item.item_uuid,
        field: 'prompt',
      })
    }
    if (!item.body.pairs.length) {
      issues.push({
        code: 'matching.pairs_missing',
        message: 'Matching items need at least one pair.',
        itemUuid: item.item_uuid,
        field: 'pairs',
      })
    }
    if (item.body.pairs.some(pair => !pair.left.trim() || !pair.right.trim())) {
      issues.push({
        code: 'matching.pair_value_missing',
        message: 'Every pair needs both left and right values.',
        itemUuid: item.item_uuid,
        field: 'pairs',
      })
    }
    const leftValues = item.body.pairs.map(pair => pair.left.trim()).filter(Boolean)
    const rightValues = item.body.pairs.map(pair => pair.right.trim()).filter(Boolean)
    if (new Set(leftValues.map(value => value.toLowerCase())).size !== leftValues.length) {
      issues.push({
        code: 'matching.left_duplicate',
        message: 'Left-side prompts should be unique.',
        itemUuid: item.item_uuid,
        field: 'pairs',
      })
    }
    if (new Set(rightValues.map(value => value.toLowerCase())).size !== rightValues.length) {
      issues.push({
        code: 'matching.right_duplicate',
        message: 'Right-side answers should be unique.',
        itemUuid: item.item_uuid,
        field: 'pairs',
      })
    }
  }

  if (item.body.kind === 'OPEN_TEXT') {
    if (!item.body.prompt.trim()) {
      issues.push({
        code: 'open_text.prompt_missing',
        message: 'Open-text prompt is required.',
        itemUuid: item.item_uuid,
      })
    }
    if (item.body.min_words !== null && item.body.min_words !== undefined && item.body.min_words < 0) {
      issues.push({
        code: 'open_text.min_words_invalid',
        message: 'Minimum words cannot be negative.',
        itemUuid: item.item_uuid,
      })
    }
  }

  if (item.body.kind === 'FORM') {
    if (!item.body.prompt.trim()) {
      issues.push({
        code: 'form.prompt_missing',
        message: 'Form prompt is required.',
        itemUuid: item.item_uuid,
      })
    }
    if (!item.body.fields.length) {
      issues.push({
        code: 'form.fields_missing',
        message: 'Form items need at least one field.',
        itemUuid: item.item_uuid,
      })
    }
    if (item.body.fields.some(field => !field.label.trim())) {
      issues.push({
        code: 'form.field_label_missing',
        message: 'Each form field needs a label.',
        itemUuid: item.item_uuid,
      })
    }
    const fieldIds = item.body.fields.map(field => field.id.trim()).filter(Boolean)
    if (new Set(fieldIds.map(value => value.toLowerCase())).size !== fieldIds.length) {
      issues.push({
        code: 'form.field_id_duplicate',
        message: 'Form fields need unique IDs.',
        itemUuid: item.item_uuid,
      })
    }
  }

  return dedupeIssues(issues)
}

function readinessFieldForIssueCode(code: string): string | undefined {
  if (code.endsWith('.prompt_missing')) return 'prompt'
  if (code === 'choice.options_missing' || code === 'choice.option_text_missing' || code === 'choice.option_duplicate') {
    return 'options'
  }
  if (code === 'choice.correct_missing' || code === 'choice.too_many_correct') return 'correct_options'
  if (
    code === 'matching.pairs_missing' ||
    code === 'matching.pair_value_missing' ||
    code === 'matching.left_duplicate' ||
    code === 'matching.right_duplicate'
  ) {
    return 'pairs'
  }
  return undefined
}

export function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  return issues.filter(issue => {
    const key = `${issue.itemUuid ?? 'assessment'}:${canonicalIssueCode(issue.code)}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function canonicalIssueCode(code: string): string {
  if (
    code === 'item.prompt_missing' ||
    code === 'choice.prompt_missing' ||
    code === 'matching.prompt_missing' ||
    code === 'open_text.prompt_missing' ||
    code === 'file.prompt_missing' ||
    code === 'form.prompt_missing' ||
    code === 'code.prompt_missing'
  ) {
    return 'prompt_missing'
  }
  return code
}
