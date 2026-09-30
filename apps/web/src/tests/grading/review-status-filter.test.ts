// UX-298: `?filter=BOGUS` fell through as `status=bogus` → 422 and an empty list under «Все».
import { describe, expect, it } from 'vite-plus/test'
import { parseStatusFilter } from '@/features/grading/review/types'

describe('review status filter from the URL', () => {
  it('keeps the filters the list offers and drops anything else', () => {
    expect(parseStatusFilter('RETURNED')).toBe('RETURNED')
    expect(parseStatusFilter('ALL')).toBe('ALL')
    expect(parseStatusFilter('BOGUS')).toBeNull()
    expect(parseStatusFilter('pending')).toBeNull()
    expect(parseStatusFilter(null)).toBeNull()
  })
})
