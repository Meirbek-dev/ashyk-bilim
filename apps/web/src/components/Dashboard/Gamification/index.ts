/**
 * Gamification Components Index
 *
 * Exports all gamification UI components
 */

// Core gamification exports
export { GamificationProfileSection } from './GamificationProfileSection';

// Primary dashboard components
export { HeroSection } from './hero-section';
export { Leaderboard } from './leaderboard';
export { EngagementStreak } from './engagement-streak';
export { RecentActivityFeed } from './recent-activity-feed';
export { CollapsibleSection } from './collapsible-section';

// UI elements
export { LevelUpCelebration } from './xp-toast';

// Re-export components from unified system
export {
  GlowingLevelBadge,
  LevelProgress,
  MilestoneProgress,
  XPGainAnimation,
  ParticleEffect,
  useXPToast,
} from '@/lib/gamification';
