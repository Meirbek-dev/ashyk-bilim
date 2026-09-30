/**
 * Centralized cache tag helpers
 * Keep tag naming consistent across server fetchers and route revalidators
 *
 * With cacheComponents enabled, use these with cacheTag() function inside `use cache` blocks
 */

// Gamification cache tags
export const gamificationTag = {
  profile: () => 'gamification:profile',
  dashboard: () => 'gamification:dashboard',
  leaderboard: () => 'gamification:leaderboard',
} as const

export function gamificationTags(): string[] {
  return [gamificationTag.profile(), gamificationTag.dashboard(), gamificationTag.leaderboard()]
}

// General cache tags
export const tags = {
  platform: 'platform',
  courses: 'courses',
  editableCourses: 'editable_courses',
  collections: 'collections',
  activities: 'activities',
  users: 'users',
} as const

export const courseTag = {
  detail: (courseUuid: string) => `course:${courseUuid}:detail`,
  access: (courseUuid: string) => `course:${courseUuid}:access`,
  contributors: (courseUuid: string) => `course:${courseUuid}:contributors`,
  certifications: (courseUuid: string) => `course:${courseUuid}:certifications`,
  editableList: () => 'courses:platform:editable',
  publicList: () => 'courses:platform:public',
} as const

export async function revalidateTags(...tagList: string[]) {
  const { revalidateTag } = await import('next/cache')
  for (const tag of tagList) revalidateTag(tag, 'max')
}
