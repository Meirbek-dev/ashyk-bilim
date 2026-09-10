import { describe, expect, it } from 'vitest'

import { LmsStatuses, getLmsStatusLabel } from '@/features/lms-status'

describe('getLmsStatusLabel localization', () => {
  it('renders the status label through the translator, not the English literal', () => {
    const t = (key: string) => `t:${key}`

    const label = getLmsStatusLabel(LmsStatuses.UNAVAILABLE, t)

    expect(label).toBe('t:unavailable')
    expect(label).not.toBe('Unavailable')
  })
})
