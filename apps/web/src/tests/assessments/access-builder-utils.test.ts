import { describe, expect, it } from 'vite-plus/test'

import {
  estimateAudiencePreviewCount,
  filterByQuery,
  getExcludedLoadedCount,
  uniqueById,
} from '@/features/assessments/studio/tabs/accessBuilderUtils'

describe('assessment access builder helpers', () => {
  it('filters pickers client-side (v2 has no eligible-* search routes), trimming and ignoring case', () => {
    const learners = [
      { id: 'u1', username: 'mira', display_name: 'Mira Smith', email: 'mira@example.com' },
      { id: 'u2', username: 'dan', display_name: 'Dan Lee', email: 'dan@example.com' },
    ]
    expect(filterByQuery(learners, '  mIRA ', user => [user.display_name, user.username, user.email])).toEqual([
      learners[0],
    ])
    expect(filterByQuery(learners, 'example.com', user => [user.email])).toHaveLength(2)
    expect(filterByQuery(learners, '', user => [user.username])).toBe(learners)
  })

  it('unions gradebook learners with the persisted allowlist, keeping the richer first row', () => {
    const fromGradebook = [{ id: 'u1', username: 'mira', display_name: 'Mira', email: 'mira@example.com' }]
    const fromAccess = [
      { id: 'u1', username: 'mira', display_name: 'Mira' },
      { id: 'u9', username: 'never-submitted', display_name: 'Only in allowlist' },
    ]
    const merged = uniqueById<{ id: string; username: string; display_name: string; email?: string }>(
      fromGradebook,
      fromAccess,
    )
    expect(merged.map(user => user.id)).toEqual(['u1', 'u9'])
    expect(merged[0]?.email).toBe('mira@example.com')
  })

  it('uses persisted all-course counts and selected restricted counts for the preview', () => {
    expect(
      estimateAudiencePreviewCount({
        mode: 'all_course_learners',
        persistedEffectiveCount: 0,
        loadedEligibleUserCount: 50,
        selectedUserCount: 12,
        selectedGroupMemberCounts: [20],
      }),
    ).toBe(0)

    expect(
      estimateAudiencePreviewCount({
        mode: 'restricted',
        persistedEffectiveCount: 70,
        loadedEligibleUserCount: 50,
        selectedUserCount: 2,
        selectedGroupMemberCounts: [12, 8],
      }),
    ).toBe(22)
  })

  it('counts exclusions only inside the loaded learner list', () => {
    expect(getExcludedLoadedCount(['a', 'b', 'c', 'd'], new Set(['b', 'z']))).toBe(3)
  })
})
