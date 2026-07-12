export type AIWorkState =
  | 'idle'
  | 'confirming'
  | 'queued'
  | 'collecting_context'
  | 'running'
  | 'checking_evidence'
  | 'complete'
  | 'needs_human_review'
  | 'failed'
  | 'cancelled'

export interface AIStage {
  state: AIWorkState
  label: string
  complete: boolean
}

const ORDERED_STATES: AIWorkState[] = ['queued', 'collecting_context', 'running', 'checking_evidence', 'complete']

export function isTerminalAIState(state: AIWorkState) {
  return state === 'complete' || state === 'failed' || state === 'cancelled' || state === 'needs_human_review'
}

export function buildAIStages(current: AIWorkState, labels: Record<AIWorkState, string>): AIStage[] {
  const currentIndex = ORDERED_STATES.indexOf(current)
  return ORDERED_STATES.map((state, index) => ({
    state,
    label: labels[state],
    complete:
      current === 'complete' || current === 'needs_human_review' || (currentIndex !== -1 && index <= currentIndex),
  }))
}
