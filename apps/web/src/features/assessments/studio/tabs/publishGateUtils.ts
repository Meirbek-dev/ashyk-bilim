import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'

export type PreviewScenarioId =
  | 'genericLearner'
  | 'specificLearner'
  | 'expiredTimer'
  | 'retakeBlocked'
  | 'lateAttempt'
  | 'restrictedAccess'
  | 'resultView'

export interface PreviewScenario {
  id: PreviewScenarioId
  titleKey: string
  descriptionKey: string
  outcomeKey: string
}

export const PREVIEW_SCENARIOS: PreviewScenario[] = [
  {
    id: 'genericLearner',
    titleKey: 'previewScenarioGeneric',
    descriptionKey: 'previewScenarioGenericDesc',
    outcomeKey: 'previewOutcomeGeneric',
  },
  {
    id: 'specificLearner',
    titleKey: 'previewScenarioSpecific',
    descriptionKey: 'previewScenarioSpecificDesc',
    outcomeKey: 'previewOutcomeSpecific',
  },
  {
    id: 'expiredTimer',
    titleKey: 'previewScenarioExpiredTimer',
    descriptionKey: 'previewScenarioExpiredTimerDesc',
    outcomeKey: 'previewOutcomeExpiredTimer',
  },
  {
    id: 'retakeBlocked',
    titleKey: 'previewScenarioRetake',
    descriptionKey: 'previewScenarioRetakeDesc',
    outcomeKey: 'previewOutcomeRetake',
  },
  {
    id: 'lateAttempt',
    titleKey: 'previewScenarioLate',
    descriptionKey: 'previewScenarioLateDesc',
    outcomeKey: 'previewOutcomeLate',
  },
  {
    id: 'restrictedAccess',
    titleKey: 'previewScenarioRestricted',
    descriptionKey: 'previewScenarioRestrictedDesc',
    outcomeKey: 'previewOutcomeRestricted',
  },
  {
    id: 'resultView',
    titleKey: 'previewScenarioResults',
    descriptionKey: 'previewScenarioResultsDesc',
    outcomeKey: 'previewOutcomeResults',
  },
]

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

export function canConfirmLifecycleChange({
  blockerCount,
  highStakes,
  successfulPreviewCount,
}: {
  blockerCount: number
  highStakes: boolean
  successfulPreviewCount: number
}): boolean {
  if (blockerCount > 0) return false
  if (highStakes && successfulPreviewCount < 1) return false
  return true
}
