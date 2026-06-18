import { describe, expect, it } from 'vite-plus/test'

import {
  buildEligibleGroupsPath,
  buildEligibleLearnersPath,
  estimateAudiencePreviewCount,
  getExcludedLoadedCount,
} from '@/features/assessments/studio/tabs/accessBuilderUtils'

describe('assessment access builder helpers', () => {
  it('builds server-side learner and group search paths with trimmed queries', () => {
    expect(buildEligibleLearnersPath('assessment-1', '  Mira Smith  ')).toBe(
      'assessments/assessment-1/access/eligible-learners?limit=50&q=Mira+Smith',
    )
    expect(buildEligibleGroupsPath('assessment-1', '')).toBe(
      'assessments/assessment-1/access/eligible-usergroups?limit=50',
    )
  })

  it('uses persisted all-course counts and selected restricted counts for the preview', () => {
    expect(
      estimateAudiencePreviewCount({
        mode: 'ALL_COURSE_LEARNERS',
        persistedEffectiveCount: 0,
        loadedEligibleUserCount: 50,
        selectedUserCount: 12,
        selectedGroupMemberCounts: [20],
      }),
    ).toBe(0)

    expect(
      estimateAudiencePreviewCount({
        mode: 'RESTRICTED',
        persistedEffectiveCount: 70,
        loadedEligibleUserCount: 50,
        selectedUserCount: 2,
        selectedGroupMemberCounts: [12, 8],
      }),
    ).toBe(22)
  })

  it('counts exclusions only inside the currently loaded server result window', () => {
    expect(getExcludedLoadedCount([1, 2, 3, 4], new Set([2, 9]))).toBe(3)
  })
})
