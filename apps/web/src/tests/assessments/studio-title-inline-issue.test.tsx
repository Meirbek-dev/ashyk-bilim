/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

// UX-120: a cleared studio title is flagged inline (`assessment.title_missing`)
// instead of surfacing as a raw «Validation failed» toast from the autosave.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/features/content-markdown', () => ({ MarkdownEditor: () => null }))
vi.mock('@/components/ui/calendar', () => ({ CalendarDateTimePicker: () => null }))

import GeneralSettingsTab from '@/features/assessments/studio/tabs/GeneralSettingsTab'
import { classifyValidationIssue } from '@/features/assessments/domain/readiness'
import { getAssessmentEditorIssues } from '@/features/assessments/studio/utils'
import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'

const state: AssessmentEditorState = {
  title: '   ',
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
  showCorrectAnswers: true,
  passThreshold: '',
  randomizeQuestions: false,
  randomizeOptions: false,
  partialCredit: true,
  gracePeriodMinutes: '',
  availableFrom: '',
  negativeMarkingPercent: '',
}

describe('studio settings title', () => {
  it('shows the title_missing issue inline under the field', () => {
    const issues = getAssessmentEditorIssues('exam', state, ((key: string) => key) as never).map(
      classifyValidationIssue,
    )
    render(<GeneralSettingsTab state={state} saveState="dirty" disabled={false} issues={issues} onChange={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('validation.assessment_title_missing')
    expect(screen.getByLabelText('titleLabel')).toHaveAttribute('aria-invalid', 'true')
  })

  // UX-292: above the server cap (10) the attempts field is flagged inline and carries `max`.
  it('flags an attempt limit above the server cap inline', () => {
    const over = { ...state, title: 'Quiz', maxAttempts: '11' }
    const issues = getAssessmentEditorIssues('exam', over, ((key: string) => key) as never).map(classifyValidationIssue)
    render(<GeneralSettingsTab state={over} saveState="dirty" disabled={false} issues={issues} onChange={() => {}} />)
    const input = screen.getByLabelText('attemptLimitLabel')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('max', '10')
    expect(screen.getByRole('alert')).toHaveTextContent('validation.policy_max_attempts_invalid')
  })
})
