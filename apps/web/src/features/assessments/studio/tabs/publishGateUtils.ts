import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'

export function isHighStakesAssessment(state: AssessmentEditorState): boolean {
  const timeLimit = Number(state.timeLimitMinutes || 0)
  const maxAttempts = Number(state.maxAttempts || 0)
  return (
    timeLimit > 0 ||
    maxAttempts === 1 ||
    state.copyPasteProtection ||
    state.tabSwitchDetection ||
    state.devtoolsDetection ||
    state.rightClickDisable ||
    state.fullscreenEnforcement
  )
}

export function canConfirmLifecycleChange({ blockerCount }: { blockerCount: number }): boolean {
  return blockerCount === 0
}
