// UX-032: a hand-in the teacher has not released yet (pending grading, or
// graded but unpublished) at the attempt cap is «received, awaiting review»,
// not the red «Эта задача сейчас недоступна» lock.
import { describe, expect, it } from 'vite-plus/test'

import { recommendedActionFor, shownSubmission } from '@/features/assessments/hooks/useAssessment'

const capped = {
  can_continue: false,
  can_start: false,
  revision_requested: false,
  disabled_reasons: ['MAX_ATTEMPTS_REACHED' as const],
}

describe('recommendedActionFor', () => {
  it('reports a pending hand-in at the cap as waiting for release', () => {
    expect(recommendedActionFor(capped, { status: 'PENDING', release_state: 'hidden' }, false)).toBe('waitForRelease')
    expect(recommendedActionFor(capped, { status: 'GRADED', release_state: 'awaiting_release' }, false)).toBe(
      'waitForRelease',
    )
  })

  it('keeps blocked for a cap with nothing pending and viewResult once released', () => {
    expect(recommendedActionFor(capped, undefined, false)).toBe('blocked')
    expect(recommendedActionFor(capped, { status: 'PUBLISHED', release_state: 'visible' }, true)).toBe('viewResult')
  })
})

// UX-123: a retake awaiting the teacher must not hide the released grade of
// record — the card shows attempt 1 and names attempt 2 as pending.
describe('shownSubmission', () => {
  const released = { id: 's1', status: 'PUBLISHED', release_state: 'visible', attempt_number: 1 }
  const pending = { id: 's2', status: 'PENDING', release_state: 'hidden', attempt_number: 2 }
  const draft = { id: 's3', status: 'DRAFT', release_state: 'hidden', attempt_number: 3 }

  it('shows the released grade of record while a retake is pending', () => {
    expect(shownSubmission([pending, released], null)).toEqual({ latest: released, pendingAttemptNumber: 2 })
  })

  it('keeps the newest hand-in when nothing is released, and the open draft above all', () => {
    expect(shownSubmission([pending], null)).toEqual({ latest: pending, pendingAttemptNumber: null })
    expect(shownSubmission([draft, pending, released], 's3')).toEqual({ latest: draft, pendingAttemptNumber: null })
    expect(shownSubmission([released], null)).toEqual({ latest: released, pendingAttemptNumber: null })
  })
})
