import { describe, expect, test } from 'vite-plus/test'

import { lockReason, renameLock } from './labels'

describe('rename lock', () => {
  test('B-ASM-30 a published test with submissions keeps its name editable, its content locked', () => {
    const answered = { allowed_actions: ['update' as const], edit_lock: 'has_submissions' as const }
    expect(renameLock(answered)).toBeNull()
    expect(lockReason(answered)).not.toBeNull()
    expect(renameLock({ allowed_actions: ['update'], edit_lock: 'archived' })).not.toBeNull()
    expect(renameLock({ allowed_actions: ['update'], edit_lock: 'scheduled' })).not.toBeNull()
    expect(renameLock({ allowed_actions: [], edit_lock: 'has_submissions' })).not.toBeNull()
  })
})
