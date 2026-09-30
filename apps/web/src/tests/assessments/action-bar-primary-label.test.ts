import { describe, expect, it } from 'vite-plus/test'

import { resolvePrimaryButtonLabelKey } from '@/features/assessments/shell/AssessmentActionBar'

// During an open attempt the primary button submits, so it must not borrow
// the runtime's entry-card label ("Continue") — the learner saw "Continue"
// on a button that opened the submit confirmation.
describe('resolvePrimaryButtonLabelKey', () => {
  it('uses the recommended entry action only before attempt content registers a submit handler', () => {
    expect(resolvePrimaryButtonLabelKey({}, 'continueDraft')).toBe('continueDraft')
    expect(resolvePrimaryButtonLabelKey({ onSubmit: () => {} }, 'continueDraft')).toBeNull()
  })

  it('always honours an explicit label from the attempt content', () => {
    expect(resolvePrimaryButtonLabelKey({ primaryButtonLabelKey: 'viewResult', onSubmit: () => {} }, 'start')).toBe(
      'viewResult',
    )
  })
})
