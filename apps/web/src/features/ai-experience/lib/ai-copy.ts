import type { AIWorkState } from './ai-run-state'

export const AI_STATE_LABELS: Record<AIWorkState, string> = {
  idle: 'Ready',
  confirming: 'Confirm action',
  queued: 'Queued',
  collecting_context: 'Collecting context',
  running: 'Analyzing',
  checking_evidence: 'Checking evidence',
  complete: 'Complete',
  needs_human_review: 'Needs teacher review',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const AI_STATE_HELP: Record<AIWorkState, string> = {
  idle: 'Start when you are ready.',
  confirming: 'Review what the AI will inspect before continuing.',
  queued: 'The run is waiting for a worker.',
  collecting_context: 'Course, assessment, and submission context are being assembled.',
  running: 'The model is producing a structured result.',
  checking_evidence: 'Citations are being checked before the result is shown.',
  complete: 'The result is ready.',
  needs_human_review: 'A teacher must approve this before it changes learning progress.',
  failed: 'The run failed. Retry or reduce context.',
  cancelled: 'The latest run was cancelled.',
}

export function modelAuditLabel(modelName?: string | null) {
  return modelName ? `Model: ${modelName}` : 'Model: not recorded'
}
