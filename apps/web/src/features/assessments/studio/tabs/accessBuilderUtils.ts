import type { AccessMode } from '@/lib/api/generated/zod'

export type { AccessMode }

/** A pickable learner: `UserSummary` (gradebook) or `AccessUser` (persisted allowlist) both fit. */
export interface AccessLearner {
  id: string
  username: string
  display_name: string
  email?: string
}

/** A pickable group: `Usergroup` (course-linked) or `AccessGroup` (persisted allowlist) both fit. */
export interface AccessGroupRow {
  id: string
  name: string
  description?: string
  member_count: number
}

/** Case-insensitive substring match over `fields`; an empty query keeps everything. */
export function filterByQuery<T>(items: T[], query: string, fields: (item: T) => (string | null | undefined)[]): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter(item => fields(item).some(value => value?.toLowerCase().includes(needle)))
}

/** Union by id, first occurrence wins (so the richer gradebook row beats the bare allowlist row). */
export function uniqueById<T extends { id: string }>(...lists: T[][]): T[] {
  const byId = new Map<string, T>()
  for (const list of lists) for (const item of list) if (!byId.has(item.id)) byId.set(item.id, item)
  return [...byId.values()]
}

export function estimateAudiencePreviewCount({
  mode,
  persistedMode,
  persistedEffectiveCount,
  loadedEligibleUserCount,
  selectedUserCount,
  selectedGroupMemberCounts,
}: {
  mode: AccessMode
  persistedMode: AccessMode | null
  persistedEffectiveCount: number | null
  loadedEligibleUserCount: number
  selectedUserCount: number
  selectedGroupMemberCounts: number[]
}): number {
  if (mode === 'all_course_learners') {
    // UX-159: the server counts enrolled learners only for a saved
    // course-wide policy; a saved allowlist count says nothing about them.
    return persistedMode === 'all_course_learners' && persistedEffectiveCount !== null
      ? persistedEffectiveCount
      : loadedEligibleUserCount
  }
  return selectedUserCount + selectedGroupMemberCounts.reduce((sum, count) => sum + count, 0)
}

export function getExcludedLoadedCount(loadedEligibleUserIds: string[], selectedUserIds: Set<string>): number {
  return loadedEligibleUserIds.filter(userId => !selectedUserIds.has(userId)).length
}

/** Restricted mode with nothing selected locks every learner out — the save asks first (UX-057). */
export function isLockout(mode: AccessMode, selectedUserCount: number, selectedGroupCount: number): boolean {
  return mode === 'restricted' && selectedUserCount === 0 && selectedGroupCount === 0
}
