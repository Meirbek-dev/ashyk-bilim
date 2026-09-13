// UX-032: a hand-in the teacher has not released yet (pending grading, or
// graded but unpublished) at the attempt cap is «received, awaiting review»,
// not the red «Эта задача сейчас недоступна» lock.
import { describe, expect, it } from 'vite-plus/test'

import { recommendedActionFor } from '@/features/assessments/hooks/useAssessment'

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
