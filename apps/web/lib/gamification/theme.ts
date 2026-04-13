/**
 * Gamification Theme System
 *
 * Unified theming for icons, colors, and visual elements.
 * Replaces scattered constants with a cohesive system.
 */

import { Award, Crown, Medal, Sparkles, Star, Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { colors } from './design-tokens';

// ============================================
// XP SOURCE THEME
// ============================================
export interface XPSourceTheme {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  label: string;
}

const xpSourceThemes: Record<string, XPSourceTheme> = {
  activity_completion: {
    icon: Award,
    color: colors.xp.activity,
    bgColor: colors.xpBg.activity,
    label: 'Activity Completed',
  },
  course_completion: {
    icon: Sparkles,
    color: colors.xp.course,
    bgColor: colors.xpBg.course,
    label: 'Course Completed',
  },
  quiz_completion: {
    icon: Zap,
    color: colors.xp.quiz,
    bgColor: colors.xpBg.quiz,
    label: 'Quiz Completed',
  },
  assignment_submission: {
    icon: Trophy,
    color: colors.xp.assignment,
    bgColor: colors.xpBg.assignment,
    label: 'Assignment Submitted',
  },
  streak_bonus: {
    icon: TrendingUp,
    color: colors.xp.streak,
    bgColor: colors.xpBg.streak,
    label: 'Streak Bonus',
  },
  login_bonus: {
    icon: Zap,
    color: colors.xp.login,
    bgColor: colors.xpBg.login,
    label: 'Daily Login',
  },
  daily_login: {
    icon: Zap,
    color: colors.xp.login,
    bgColor: colors.xpBg.login,
    label: 'Daily Login',
  },
  default: {
    icon: Award,
    color: colors.xp.default,
    bgColor: colors.xpBg.default,
    label: 'XP Earned',
  },
} as const;

export function getXPSourceTheme(source: string): XPSourceTheme {
  const theme = xpSourceThemes[source];
  if (!theme) {
    return xpSourceThemes.default!;
  }
  return theme;
}

// ============================================
// RANK THEME
// ============================================
export interface RankTheme {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  badge: 'gold' | 'silver' | 'bronze' | null;
}

const rankThemes: Record<number, RankTheme> = {
  1: {
    icon: Trophy,
    color: colors.rank.gold,
    bgColor: colors.rankBg.gold,
    badge: 'gold',
  },
  2: {
    icon: Medal,
    color: colors.rank.silver,
    bgColor: colors.rankBg.silver,
    badge: 'silver',
  },
  3: {
    icon: Award,
    color: colors.rank.bronze,
    bgColor: colors.rankBg.bronze,
    badge: 'bronze',
  },
} as const;

export function getRankTheme(rank: number): RankTheme {
  return (
    rankThemes[rank] || {
      icon: Award,
      color: colors.xp.default,
      bgColor: colors.xpBg.default,
      badge: null,
    }
  );
}

// ============================================
// LEVEL THEME
// ============================================
export interface LevelTheme {
  icon: LucideIcon;
  color: string;
  titleKey: string;
}

const levelThemes: Record<number, LevelTheme> = {
  1: { icon: Target, color: colors.level[1], titleKey: 'novice' },
  5: { icon: Star, color: colors.level[5], titleKey: 'apprentice' },
  10: { icon: Zap, color: colors.level[10], titleKey: 'scholar' },
  15: { icon: Trophy, color: colors.level[15], titleKey: 'expert' },
  25: { icon: Crown, color: colors.level[25], titleKey: 'master' },
  50: { icon: Crown, color: colors.level[50], titleKey: 'grandmaster' },
} as const;

export function getLevelTheme(level: number): LevelTheme {
  // Find the closest level milestone
  const milestones = [1, 5, 10, 15, 25, 50];
  const milestone = milestones.toReversed().find((m) => level >= m) || 1;
  const theme = levelThemes[milestone];
  // Guaranteed fallback to novice level
  return theme || { icon: Target, color: colors.level[1], titleKey: 'novice' };
}
