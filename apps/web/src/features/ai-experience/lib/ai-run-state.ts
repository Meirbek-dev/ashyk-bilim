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

export type AIStage = {
  state: AIWorkState
  label: string
  complete: boolean
}

const ORDERED_STATES: AIWorkState[] = ['queued', 'collecting_context', 'running', 'checking_evidence', 'complete']

export function isTerminalAIState(state: AIWorkState) {
  return state === 'complete' || state === 'failed' || state === 'cancelled' || state === 'needs_human_review'
}

export function aiStateProgress(state: AIWorkState) {
  if (state === 'idle' || state === 'confirming') return 0
  if (state === 'failed' || state === 'cancelled') return 100
  if (state === 'needs_human_review') return 92
  const index = ORDERED_STATES.indexOf(state)
  return index < 0 ? 0 : Math.round(((index + 1) / ORDERED_STATES.length) * 100)
}

export function buildAIStages(current: AIWorkState, labels: Record<AIWorkState, string>): AIStage[] {
  const currentIndex = ORDERED_STATES.indexOf(current)
  return ORDERED_STATES.map((state, index) => ({
    state,
    label: labels[state],
    complete:
      current === 'complete' || current === 'needs_human_review' || (currentIndex >= 0 && index <= currentIndex),
  }))
}
