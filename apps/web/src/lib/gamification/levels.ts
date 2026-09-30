/**
 * Shared gamification level utilities
 * Centralizes level config, unlocks, and helpers
 *
 * Note: Imports LevelInfo from types for consistency
 */

import { Crown, GraduationCap, Star, Target, Trophy } from 'lucide-react'
import type { LevelInfo } from '@/types/gamification/profile'

/** The server's level curve (`ab_domain::gamification::xp_for_level`): total XP at which `level` starts. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  const n = level - 1
  return 50 * n * n + 50 * n
}

// Level configuration with RPG-style progression (translation keys)
const LEVEL_CONFIG: Record<number, LevelInfo> = {
  1: {
    level: 1,
    title: 'novice',
    color: 'text-gray-500',
    icon: Target,
    minXP: xpForLevel(1),
    unlocks: ['basicProfile'],
  },
  5: {
    level: 5,
    title: 'apprentice',
    color: 'text-blue-500',
    icon: Star,
    minXP: xpForLevel(5),
    unlocks: ['avatarFrames'],
  },
  10: {
    level: 10,
    title: 'scholar',
    color: 'text-purple-500',
    icon: GraduationCap,
    minXP: xpForLevel(10),
    unlocks: ['customAvatarHat'],
  },
  15: {
    level: 15,
    title: 'expert',
    color: 'text-green-500',
    icon: Trophy,
    minXP: xpForLevel(15),
    unlocks: ['avatarAccessories'],
  },
  25: {
    level: 25,
    title: 'master',
    color: 'text-orange-500',
    icon: Crown,
    minXP: xpForLevel(25),
    unlocks: ['exclusiveThemes'],
  },
  50: {
    level: 50,
    title: 'grandmaster',
    color: 'text-red-500',
    icon: Crown,
    minXP: xpForLevel(50),
    unlocks: ['legendaryStatus'],
  },
}

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
} as const

// Helper to select level info and localize title
export function getLevelInfo(level: number, t: (key: string) => string): LevelInfo {
  const availableLevels = Object.keys(LEVEL_CONFIG)
    .map(Number)
    .toSorted((a, b) => b - a)
  const currentLevelConfig = availableLevels.find(configLevel => level >= configLevel) || 1
  const baseConfig = LEVEL_CONFIG[currentLevelConfig] ?? LEVEL_CONFIG[1]

  if (!baseConfig) {
    throw new Error('Invalid level configuration')
  }

  return {
    ...baseConfig,
    level,
    title: t(`levels.titles.${baseConfig.title}`),
  }
}

export function getUnlockedFeatures(level: number, t: (key: string) => string): string[] {
  const unlocked: string[] = []

  Object.values(LEVEL_CONFIG).forEach(config => {
    if (level >= config.level && config.unlocks) {
      config.unlocks.forEach(unlock => {
        unlocked.push(t(`levels.unlocks.${unlock}`))
      })
    }
  })

  AVATAR_UNLOCKS.frames.forEach(frame => {
    if (level >= frame.level) {
      unlocked.push(t(`avatar.frames.${frame.name}`))
    }
  })
  AVATAR_UNLOCKS.accessories.forEach(accessory => {
    if (level >= accessory.level) {
      unlocked.push(t(`avatar.accessories.${accessory.name}`))
    }
  })

  return unlocked
}
