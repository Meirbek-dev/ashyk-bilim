/**
 * Gamification Design Tokens
 *
 * Centralized design system for gamification components.
 * Ensures consistency across spacing, timing, colors, and animations.
 */

// ============================================
// SPACING
// ============================================
export const spacing = {
  card: {
    padding: 'p-6',
    gap: 'gap-6',
  },
  section: {
    gap: 'space-y-4',
    gapLarge: 'space-y-6',
  },
  inline: {
    xs: 'gap-1',
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4',
  },
} as const

// ============================================
// ANIMATIONS
// ============================================
export const animations = {
  duration: {
    fast: 150,
    normal: 200,
    slow: 300,
    verySlow: 500,
  },
  easing: {
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  css: {
    fast: 'transition-all duration-150 ease-in-out',
    normal: 'transition-all duration-200 ease-in-out',
    slow: 'transition-all duration-300 ease-in-out',
    smooth: 'transition-all duration-200 cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const

// ============================================
// COLORS (Semantic + Accessibility)
// ============================================
export const colors = {
  xp: {
    activity: 'text-blue-600 dark:text-blue-400',
    course: 'text-purple-600 dark:text-purple-400',
    quiz: 'text-yellow-600 dark:text-yellow-400',
    streak: 'text-orange-600 dark:text-orange-400',
    login: 'text-cyan-600 dark:text-cyan-400',
    default: 'text-gray-600 dark:text-gray-400',
  },
  xpBg: {
    activity: 'bg-blue-500/10 dark:bg-blue-400/10',
    course: 'bg-purple-500/10 dark:bg-purple-400/10',
    quiz: 'bg-yellow-500/10 dark:bg-yellow-400/10',
    streak: 'bg-orange-500/10 dark:bg-orange-400/10',
    login: 'bg-cyan-500/10 dark:bg-cyan-400/10',
    default: 'bg-gray-500/10 dark:bg-gray-400/10',
  },
  rank: {
    gold: 'text-yellow-500',
    silver: 'text-gray-400',
    bronze: 'text-amber-600',
  },
  rankBg: {
    gold: 'bg-yellow-500/10',
    silver: 'bg-gray-400/10',
    bronze: 'bg-amber-600/10',
  },
  level: {
    1: 'text-gray-500',
    5: 'text-blue-500',
    10: 'text-purple-500',
    15: 'text-green-500',
    25: 'text-orange-500',
    50: 'text-red-500',
  },
} as const


