export type AccessMode = 'ALL_COURSE_LEARNERS' | 'RESTRICTED'

const DEFAULT_AUDIENCE_SEARCH_LIMIT = 50

export function buildEligibleLearnersPath(
  assessmentUuid: string,
  query: string,
  limit = DEFAULT_AUDIENCE_SEARCH_LIMIT,
): string {
  return buildAudienceSearchPath(assessmentUuid, 'eligible-learners', query, limit)
}

export function buildEligibleGroupsPath(
  assessmentUuid: string,
  query: string,
  limit = DEFAULT_AUDIENCE_SEARCH_LIMIT,
): string {
  return buildAudienceSearchPath(assessmentUuid, 'eligible-usergroups', query, limit)
}

export function estimateAudiencePreviewCount({
  mode,
  persistedEffectiveCount,
  loadedEligibleUserCount,
  selectedUserCount,
  selectedGroupMemberCounts,
}: {
  mode: AccessMode
  persistedEffectiveCount: number | null
  loadedEligibleUserCount: number
  selectedUserCount: number
  selectedGroupMemberCounts: number[]
}): number {
  if (mode === 'ALL_COURSE_LEARNERS') {
    return persistedEffectiveCount ?? loadedEligibleUserCount
  }
  return selectedUserCount + selectedGroupMemberCounts.reduce((sum, count) => sum + count, 0)
}

export function getExcludedLoadedCount(loadedEligibleUserIds: number[], selectedUserIds: Set<number>): number {
  return loadedEligibleUserIds.filter(userId => !selectedUserIds.has(userId)).length
}

function buildAudienceSearchPath(
  assessmentUuid: string,
  kind: 'eligible-learners' | 'eligible-usergroups',
  query: string,
  limit: number,
): string {
  const params = new URLSearchParams({ limit: String(limit) })
  const trimmed = query.trim()
  if (trimmed) params.set('q', trimmed)
  return `assessments/${assessmentUuid}/access/${kind}?${params.toString()}`
}
