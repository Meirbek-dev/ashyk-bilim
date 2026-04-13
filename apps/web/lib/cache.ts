/**
 * Centralized cache utilities for Next.js cacheComponents
 *
 * This module provides cached data fetching functions using the `use cache` directive.
 * With cacheComponents enabled, data fetching is excluded from pre-renders by default
 * unless explicitly cached with `use cache`.
 *
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
 */

import { cacheLife, cacheTag } from 'next/cache';
// Centralized cache utilities helper

// Cache life profiles for different data types. These are lightweight
// semantic aliases to be used by callers; prefer using explicit `cacheLife`
// calls where a specific profile is required.
export const CacheProfiles = {
  // Rarely changing static content
  static: { stale: 60 * 30, revalidate: 60 * 60, expire: 60 * 60 * 24 },
  // Platform metadata - updated occasionally.
  // Short stale/revalidate so a null entry cached during Docker build (when
  // the API is unreachable) is refreshed within ~30 s of the first runtime
  // request rather than sitting stale for minutes.
  platform: { stale: 30, revalidate: 60, expire: 60 * 60 },
  // Course metadata and structure - increased stale to reduce frequent upstream calls
  courses: { stale: 60 * 5, revalidate: 60 * 10, expire: 60 * 60 * 24 },
  // Per-user dynamic data
  user: { stale: 30, revalidate: 60, expire: 60 * 5 },
  // Realtime-ish data (gamification, metrics)
  realtime: { stale: 15, revalidate: 30, expire: 60 * 2 },
  // Activities - very short stale for content editing
  activities: { stale: 5, revalidate: 30, expire: 60 * 30 },
} as const;

// Re-export Next.js cache helpers to provide a single import location.
export { cacheLife, cacheTag };
