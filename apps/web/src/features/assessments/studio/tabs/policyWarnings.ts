import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'

export type ResultReleasePolicy = 'NONE' | 'SCORE_ONLY' | 'FULL'

export type PolicyWarningCode =
  | 'strictIntegrityNeedsAccommodation'
  | 'lowViolationThreshold'
  | 'shortTimedExam'
  | 'highPenaltyHighPass'

export function resultReleasePolicyFromState(state: AssessmentEditorState): ResultReleasePolicy {
  if (!state.allowResultReview) return 'NONE'
  return state.showCorrectAnswers ? 'FULL' : 'SCORE_ONLY'
}

export function applyResultReleasePolicy(
  state: AssessmentEditorState,
  policy: ResultReleasePolicy,
): AssessmentEditorState {
  if (policy === 'NONE') return { ...state, allowResultReview: false, showCorrectAnswers: false }
  if (policy === 'SCORE_ONLY') return { ...state, allowResultReview: true, showCorrectAnswers: false }
  return { ...state, allowResultReview: true, showCorrectAnswers: true }
}

export function getPolicyWarningCodes(state: AssessmentEditorState): PolicyWarningCode[] {
  const warnings: PolicyWarningCode[] = []
  const violationThreshold = numericValue(state.violationThreshold)
  const timeLimitMinutes = numericValue(state.timeLimitMinutes)
  const passThreshold = numericValue(state.passThreshold)
  const negativeMarkingPercent = numericValue(state.negativeMarkingPercent)
  const strictIntegrityEnabled =
    state.fullscreenEnforcement || state.copyPasteProtection || state.rightClickDisable || state.devtoolsDetection

  if (strictIntegrityEnabled) {
    warnings.push('strictIntegrityNeedsAccommodation')
  }
  if (state.tabSwitchDetection && violationThreshold !== null && violationThreshold <= 1) {
    warnings.push('lowViolationThreshold')
  }
  if (timeLimitMinutes !== null && timeLimitMinutes > 0 && timeLimitMinutes < 10) {
    warnings.push('shortTimedExam')
  }
  if (
    passThreshold !== null &&
    negativeMarkingPercent !== null &&
    passThreshold >= 80 &&
    negativeMarkingPercent >= 25
  ) {
    warnings.push('highPenaltyHighPass')
  }

  return warnings
}

function numericValue(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
