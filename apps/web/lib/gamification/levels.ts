/**
 * Shared gamification level utilities
 * Centralizes level config, unlocks, and helpers
 *
 * Note: Imports LevelInfo from types for consistency
 */

import { Crown, Star, Target, Trophy, Zap } from 'lucide-react';
import type { LevelInfo } from '@/types/gamification/profile';

// Level configuration with RPG-style progression (translation keys)
export const LEVEL_CONFIG: Record<number, LevelInfo> = {
  1: {
    level: 1,
    title: 'novice',
    color: 'text-gray-500',
    icon: Target,
    minXP: 0,
    unlocks: ['basicProfile'],
  },
  5: {
    level: 5,
    title: 'apprentice',
    color: 'text-blue-500',
    icon: Star,
    minXP: 1000,
    unlocks: ['avatarFrames'],
  },
  10: {
    level: 10,
    title: 'scholar',
    color: 'text-purple-500',
    icon: Zap,
    minXP: 3000,
    unlocks: ['customAvatarHat'],
  },
  15: {
    level: 15,
    title: 'expert',
    color: 'text-green-500',
    icon: Trophy,
    minXP: 6000,
    unlocks: ['avatarAccessories'],
  },
  25: {
    level: 25,
    title: 'master',
    color: 'text-orange-500',
    icon: Crown,
    minXP: 12_000,
    unlocks: ['exclusiveThemes'],
  },
  50: {
    level: 50,
    title: 'grandmaster',
    color: 'text-red-500',
    icon: Crown,
    minXP: 30_000,
    unlocks: ['legendaryStatus'],
  },
};

// Avatar customization unlocks (translation keys)
export const AVATAR_UNLOCKS = {
  frames: [
    { id: 'golden', level: 5, name: 'golden', color: 'border-yellow-400' },
    { id: 'silver', level: 8, name: 'silver', color: 'border-gray-400' },
    { id: 'diamond', level: 15, name: 'diamond', color: 'border-blue-400' },
    { id: 'legendary', level: 25, name: 'legendary', color: 'border-purple-500' },
  ],
  accessories: [
    { id: 'wizard_hat', level: 10, name: 'wizardHat', icon: '🎩' },
    { id: 'crown', level: 20, name: 'scholarCrown', icon: '👑' },
    { id: 'glasses', level: 15, name: 'smartGlasses', icon: '🤓' },
    { id: 'cape', level: 30, name: 'knowledgeCape', icon: '🦸' },
  ],
} as const;

// Helper to select level info and localize title
export function getLevelInfo(level: number, t: (key: string) => string): LevelInfo {
  const availableLevels = Object.keys(LEVEL_CONFIG)
    .map(Number)
    .toSorted((a, b) => b - a);
  const currentLevelConfig = availableLevels.find((configLevel) => level >= configLevel) || 1;
  const baseConfig = LEVEL_CONFIG[currentLevelConfig] ?? LEVEL_CONFIG[1];

  if (!baseConfig) {
    throw new Error('Invalid level configuration');
  }

  return {
    ...baseConfig,
    level,
    title: t(`levels.titles.${baseConfig.title}`),
  };
}

export function getUnlockedFeatures(level: number, t: (key: string) => string): string[] {
  const unlocked: string[] = [];

  Object.values(LEVEL_CONFIG).forEach((config) => {
    if (level >= config.level && config.unlocks) {
      config.unlocks.forEach((unlock) => {
        unlocked.push(t(`levels.unlocks.${unlock}`));
      });
    }
  });

  AVATAR_UNLOCKS.frames.forEach((frame) => {
    if (level >= frame.level) {
      unlocked.push(t(`avatar.frames.${frame.name}`));
    }
  });
  AVATAR_UNLOCKS.accessories.forEach((accessory) => {
    if (level >= accessory.level) {
      unlocked.push(t(`avatar.accessories.${accessory.name}`));
    }
  });

  return unlocked;
}
