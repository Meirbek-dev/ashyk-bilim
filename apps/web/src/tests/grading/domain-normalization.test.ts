import { describe, expect, it } from 'vitest'
import {
  canTransitionSubmission,
  getSubmissionStatusLabel,
  normalizeActivityProgressCell,
  normalizeSubmission,
  parseScoreInput,
  type SubmissionStatus,
} from '@/features/grading/domain'

describe('grading boundary normalization', () => {
  it('fills default values for optional activity progress cells', () => {
    const normalized = normalizeActivityProgressCell({
      activity_id: 7,
      state: 'NOT_STARTED',
    })

    expect(normalized.attempt_count).toBe(0)
    expect(normalized.is_late).toBe(false)
    expect(normalized.teacher_action_required).toBe(false)
  })

  it('normalizes submissions to app-safe defaults', () => {
    const normalized = normalizeSubmission({
      activity_id: 7,
      assessment_type: 'manual_assessment',
      created_at: '2025-01-01T00:00:00Z',
      id: 1,
      submission_uuid: 'submission-1',
      updated_at: '2025-01-01T00:00:00Z',
      user_id: 11,
    } as never)

    expect(normalized.status).toBe('PENDING')
    expect(normalized.is_late).toBe(false)
    expect(normalized.attempt_number).toBe(0)
  })

  it('uses an explicit unknown-status label for unsupported values', () => {
    const label = getSubmissionStatusLabel('UNSUPPORTED_STATUS' as unknown as SubmissionStatus, key => key)

    expect(label).toBe('statusUnknown')
  })

  it('rejects unsupported transitions rather than silently defaulting them', () => {
    expect(canTransitionSubmission('UNSUPPORTED_STATUS' as unknown as SubmissionStatus, 'PENDING')).toBe(false)
    expect(canTransitionSubmission('PENDING', 'UNSUPPORTED_STATUS' as unknown as SubmissionStatus)).toBe(false)
  })

  it('treats whitespace-only score input as empty', () => {
    expect(parseScoreInput('   ')).toBeNull()
  })
})
