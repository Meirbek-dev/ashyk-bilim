import { describe, expect, test } from 'vite-plus/test'

import { editMode } from '../model/route'
import { lockReason, wordingLock } from './labels'

describe('wording lock', () => {
  test('B-ASM-30 a published test with submissions keeps its name editable, its content locked', () => {
    const answered = {
      allowed_actions: ['update' as const, 'edit_wording' as const],
      edit_lock: 'has_submissions' as const,
    }
    expect(wordingLock(answered)).toBeNull()
    expect(lockReason(answered)).not.toBeNull()
    expect(wordingLock({ allowed_actions: ['update'], edit_lock: 'archived' })).not.toBeNull()
    expect(wordingLock({ allowed_actions: ['update'], edit_lock: 'scheduled' })).not.toBeNull()
    expect(wordingLock({ allowed_actions: [], edit_lock: 'has_submissions' })).not.toBeNull()
  })

  test('B-ASM-31 the edit mode follows allowed_actions: edit = all, edit_wording = wording, else none', () => {
    expect(editMode({ allowed_actions: ['update', 'edit'] })).toBe('all')
    expect(editMode({ allowed_actions: ['update', 'edit_wording'] })).toBe('wording')
    expect(editMode({ allowed_actions: ['update'] })).toBe('none')
    expect(editMode({ allowed_actions: [] })).toBe('none')
  })
})
