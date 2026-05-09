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
} as const;

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
} as const;

// ============================================
// COLORS (Semantic + Accessibility)
// ============================================
export const colors = {
  xp: {
    activity: 'text-blue-600 dark:text-blue-400',
    course: 'text-purple-600 dark:text-purple-400',
    quiz: 'text-yellow-600 dark:text-yellow-400',
    assignment: 'text-green-600 dark:text-green-400',
    streak: 'text-orange-600 dark:text-orange-400',
    login: 'text-cyan-600 dark:text-cyan-400',
    default: 'text-gray-600 dark:text-gray-400',
  },
  xpBg: {
    activity: 'bg-blue-500/10 dark:bg-blue-400/10',
    course: 'bg-purple-500/10 dark:bg-purple-400/10',
    quiz: 'bg-yellow-500/10 dark:bg-yellow-400/10',
    assignment: 'bg-green-500/10 dark:bg-green-400/10',
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
} as const;

// ============================================
// SHADOWS & EFFECTS
// ============================================
export const effects = {
  glow: {
    sm: 'shadow-sm hover:shadow-md',
    md: 'shadow-md hover:shadow-lg',
    lg: 'shadow-lg hover:shadow-xl',
  },
  blur: {
    sm: 'backdrop-blur-sm',
    md: 'backdrop-blur-md',
    lg: 'backdrop-blur-lg',
  },
} as const;

// ============================================
// SIZES
// ============================================
export const sizes = {
  avatar: {
    'xs': 'h-6 w-6',
    'sm': 'h-8 w-8',
    'md': 'h-10 w-10',
    'lg': 'h-12 w-12',
    'xl': 'h-16 w-16',
    '2xl': 'h-20 w-20',
    '3xl': 'h-32 w-32',
  },
  icon: {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-8 w-8',
  },
  badge: {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  },
} as const;

// ============================================
// FRAMER MOTION VARIANTS
// ============================================
export const motionVariants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  },
  bounce: {
    initial: { opacity: 0, scale: 0.3 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 20,
      },
    },
    exit: { opacity: 0, scale: 0.8 },
  },
} as const;

// ============================================
// NOTIFICATION POSITIONS
// ============================================
export const notificationPositions = {
  'top-left': 'top-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
} as const;
