import type { Profile } from '#/shared/api/gen/types.gen'

/** Leaderboard rows per "Show more" (the API allows 1..=100). */
export const LEADERBOARD_PAGE = 20

/** Level progress exactly as the server reports it (UX-064: no client level table). `next` is null at the cap. */
export function levelProgress(profile: Profile) {
  const atCap = profile.xp_to_next_level <= 0
  return {
    percent: atCap ? 100 : Math.min(100, Math.max(0, Math.round(profile.level_progress_percent))),
    next: atCap ? null : profile.level + 1,
    left: Math.max(0, profile.xp_to_next_level),
  }
}

// The server's streak day: unix seconds div 86 400 (UTC), as in `record_streak`.
export const dayOf = (unix: number) => Math.floor(unix / 86_400)

/**
 * A streak is alive while its last day is today or yesterday; the server only resets it on the next record, so an
 * older one is shown as 0.
 */
export function activeStreak(count: number, lastUnix: number | null | undefined, nowUnix: number): number {
  if (lastUnix === null || lastUnix === undefined) return 0
  return dayOf(nowUnix) - dayOf(lastUnix) <= 1 ? count : 0
}

/** The /home line: the live learning streak, or null when there is none to show. */
export function homeStreak(profile: Profile, nowUnix: number): number | null {
  const days = activeStreak(profile.learning_streak, profile.last_learning_at_unix, nowUnix)
  return days > 0 ? days : null
}
