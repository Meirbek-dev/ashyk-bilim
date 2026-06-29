import { describe, expect, it } from 'vite-plus/test'

import { canConfirmLifecycleChange, isHighStakesAssessment } from '@/features/assessments/studio/tabs/publishGateUtils'
import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'

const baseState: AssessmentEditorState = {
  title: 'Exam',
  description: '',
  dueAt: '',
  gradingType: 'PERCENTAGE',
  maxAttempts: '',
  timeLimitMinutes: '',
  copyPasteProtection: false,
  tabSwitchDetection: false,
  devtoolsDetection: false,
  rightClickDisable: false,
  fullscreenEnforcement: false,
  violationThreshold: '3',
  allowResultReview: true,
  showCorrectAnswers: false,
  passThreshold: '',
  randomizeQuestions: false,
  randomizeOptions: false,
  partialCredit: false,
  gracePeriodMinutes: '',
  availableFrom: '',
  negativeMarkingPercent: '',
}

describe('assessment publish gate helpers', () => {
  it('treats timed, single-attempt, or integrity-deterrent exams as high-stakes', () => {
    expect(isHighStakesAssessment(baseState)).toBe(false)
    expect(isHighStakesAssessment({ ...baseState, timeLimitMinutes: '45' })).toBe(true)
    expect(isHighStakesAssessment({ ...baseState, maxAttempts: '1' })).toBe(true)
    expect(isHighStakesAssessment({ ...baseState, fullscreenEnforcement: true })).toBe(true)
  })

  it('requires zero blockers and a successful preview for high-stakes lifecycle changes', () => {
    expect(canConfirmLifecycleChange({ blockerCount: 1, highStakes: false, successfulPreviewCount: 3 })).toBe(false)
    expect(canConfirmLifecycleChange({ blockerCount: 0, highStakes: false, successfulPreviewCount: 0 })).toBe(true)
    expect(canConfirmLifecycleChange({ blockerCount: 0, highStakes: true, successfulPreviewCount: 0 })).toBe(false)
    expect(canConfirmLifecycleChange({ blockerCount: 0, highStakes: true, successfulPreviewCount: 1 })).toBe(true)
  })
})
