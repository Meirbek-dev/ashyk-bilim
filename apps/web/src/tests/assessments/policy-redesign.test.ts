import { describe, expect, it } from 'vite-plus/test'

import { policyFromAssessmentPolicy } from '@/features/assessments/domain/policy'
import {
  applyResultReleasePolicy,
  getPolicyWarningCodes,
  resultReleasePolicyFromState,
} from '@/features/assessments/studio/tabs/policyWarnings'
import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'

const baseState: AssessmentEditorState = {
  title: 'Exam',
  description: '',
  dueAt: '',
  gradingType: 'PERCENTAGE',
  maxAttempts: '1',
  timeLimitMinutes: '',
  copyPasteProtection: false,
  tabSwitchDetection: false,
  devtoolsDetection: false,
  rightClickDisable: false,
  fullscreenEnforcement: false,
  violationThreshold: '3',
  allowResultReview: true,
  showCorrectAnswers: true,
  passThreshold: '',
  randomizeQuestions: false,
  randomizeOptions: false,
  partialCredit: false,
  gracePeriodMinutes: '',
  availableFrom: '',
  negativeMarkingPercent: '',
}

describe('assessment policy redesign helpers', () => {
  it('maps release policy to the legacy booleans without ambiguity', () => {
    expect(resultReleasePolicyFromState(baseState)).toBe('FULL')
    expect(resultReleasePolicyFromState({ ...baseState, showCorrectAnswers: false })).toBe('SCORE_ONLY')
    expect(resultReleasePolicyFromState({ ...baseState, allowResultReview: false })).toBe('NONE')

    expect(applyResultReleasePolicy(baseState, 'NONE')).toMatchObject({
      allowResultReview: false,
      showCorrectAnswers: false,
    })
    expect(applyResultReleasePolicy(baseState, 'SCORE_ONLY')).toMatchObject({
      allowResultReview: true,
      showCorrectAnswers: false,
    })
  })

  it('surfaces warnings for harsh or accessibility-sensitive combinations', () => {
    const warnings = getPolicyWarningCodes({
      ...baseState,
      fullscreenEnforcement: true,
      tabSwitchDetection: true,
      violationThreshold: '1',
      timeLimitMinutes: '5',
      passThreshold: '90',
      negativeMarkingPercent: '25',
    })

    expect(warnings).toEqual([
      'strictIntegrityNeedsAccommodation',
      'lowViolationThreshold',
      'shortTimedExam',
      'highPenaltyHighPass',
    ])
  })
})

describe('assessment runtime policy contract', () => {
  it('uses canonical review visibility before legacy settings', () => {
    const policy = policyFromAssessmentPolicy({
      canonical_policy: {
        review_visibility: 'SCORE_ONLY',
        max_attempts: 2,
        time_limit_seconds: 1800,
        integrity: { tab_switch_detection: true, violation_threshold: 2 },
      },
      settings_json: {
        review_visibility: 'FULL',
        allow_result_review: true,
        show_correct_answers: true,
      },
    })

    expect(policy.reviewVisibility).toBe('SCORE_ONLY')
    expect(policy.resultReviewAllowed).toBe(true)
    expect(policy.correctAnswersVisible).toBe(false)
    expect(policy.maxAttempts).toBe(2)
    expect(policy.antiCheat.tabSwitchDetection).toBe(true)
  })

  it('falls back to legacy result review booleans', () => {
    expect(
      policyFromAssessmentPolicy({
        settings_json: { allow_result_review: true, show_correct_answers: false },
      }).reviewVisibility,
    ).toBe('SCORE_ONLY')
  })
})
