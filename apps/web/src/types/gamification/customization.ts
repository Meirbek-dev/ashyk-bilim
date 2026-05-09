import * as v from 'valibot';

/**
 * Avatar Customization Types
 * Frames, accessories, and unlockable cosmetics
 */

// Avatar frame
export interface AvatarFrame {
  id: string;
  name: string;
  nameKey: string; // Translation key
  unlockLevel: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  color: string; // Border color class
  glowColor?: string; // Optional glow effect
  isUnlocked: boolean;
  isEquipped: boolean;
}

// Avatar accessory
export interface AvatarAccessory {
  id: string;
  name: string;
  nameKey: string; // Translation key
  unlockLevel: number;
  icon: string; // Emoji or icon identifier
  position: 'hat' | 'glasses' | 'badge' | 'background';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  isUnlocked: boolean;
  isEquipped: boolean;
}

// Complete avatar customization
export interface AvatarCustomization {
  frame: AvatarFrame | null;
  accessories: AvatarAccessory[];
  backgroundColor?: string;
}

// Avatar unlock
export interface AvatarUnlock {
  type: 'frame' | 'accessory';
  item: AvatarFrame | AvatarAccessory;
  unlockedAt: string; // ISO timestamp
  level: number; // Level when unlocked
}

// Avatar customization preset
export interface AvatarPreset {
  id: string;
  name: string;
  description: string;
  customization: AvatarCustomization;
  isDefault: boolean;
}

export const AvatarFrameSchema = v.object({
  id: v.string(),
  name: v.string(),
  nameKey: v.string(),
  unlockLevel: v.pipe(v.number(), v.minValue(1)),
  rarity: v.picklist(['common', 'rare', 'epic', 'legendary']),
  color: v.string(),
  glowColor: v.optional(v.string()),
  isUnlocked: v.boolean(),
  isEquipped: v.boolean(),
});

export const AvatarAccessorySchema = v.object({
  id: v.string(),
  name: v.string(),
  nameKey: v.string(),
  unlockLevel: v.pipe(v.number(), v.minValue(1)),
  icon: v.string(),
  position: v.picklist(['hat', 'glasses', 'badge', 'background']),
  rarity: v.picklist(['common', 'rare', 'epic', 'legendary']),
  isUnlocked: v.boolean(),
  isEquipped: v.boolean(),
});

export const AvatarCustomizationSchema = v.object({
  frame: v.nullable(AvatarFrameSchema),
  accessories: v.array(AvatarAccessorySchema),
  backgroundColor: v.optional(v.string()),
});

export const AvatarUnlockSchema = v.object({
  type: v.picklist(['frame', 'accessory']),
  item: v.union([AvatarFrameSchema, AvatarAccessorySchema]),
  unlockedAt: v.string(),
  level: v.number(),
});

export const AvatarPresetSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  customization: AvatarCustomizationSchema,
  isDefault: v.boolean(),
});

// Frame definitions (synced with backend)
export const AVATAR_FRAMES: Omit<AvatarFrame, 'isUnlocked' | 'isEquipped'>[] = [
  {
    id: 'golden',
    name: 'Golden',
    nameKey: 'gamification.avatarFrames.golden',
    unlockLevel: 5,
    rarity: 'rare',
    color: 'border-yellow-400',
    glowColor: 'shadow-yellow-400/50',
  },
  {
    id: 'silver',
    name: 'Silver',
    nameKey: 'gamification.avatarFrames.silver',
    unlockLevel: 8,
    rarity: 'rare',
    color: 'border-gray-400',
    glowColor: 'shadow-gray-400/50',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    nameKey: 'gamification.avatarFrames.diamond',
    unlockLevel: 15,
    rarity: 'epic',
    color: 'border-blue-400',
    glowColor: 'shadow-blue-400/50',
  },
  {
    id: 'legendary',
    name: 'Legendary',
    nameKey: 'gamification.avatarFrames.legendary',
    unlockLevel: 25,
    rarity: 'legendary',
    color: 'border-purple-500',
    glowColor: 'shadow-purple-500/50',
  },
  {
    id: 'grandmaster',
    name: 'Grandmaster',
    nameKey: 'gamification.avatarFrames.grandmaster',
    unlockLevel: 50,
    rarity: 'legendary',
    color: 'border-red-500',
    glowColor: 'shadow-red-500/50',
  },
];

// Accessory definitions (synced with backend)
export const AVATAR_ACCESSORIES: Omit<AvatarAccessory, 'isUnlocked' | 'isEquipped'>[] = [
  {
    id: 'wizard_hat',
    name: 'Wizard Hat',
    nameKey: 'gamification.avatarAccessories.wizardHat',
    unlockLevel: 10,
    icon: '🎩',
    position: 'hat',
    rarity: 'rare',
  },
  {
    id: 'crown',
    name: 'Scholar Crown',
    nameKey: 'gamification.avatarAccessories.scholarCrown',
    unlockLevel: 20,
    icon: '👑',
    position: 'hat',
    rarity: 'epic',
  },
  {
    id: 'glasses',
    name: 'Smart Glasses',
    nameKey: 'gamification.avatarAccessories.smartGlasses',
    unlockLevel: 15,
    icon: '🤓',
    position: 'glasses',
    rarity: 'rare',
  },
  {
    id: 'cape',
    name: 'Knowledge Cape',
    nameKey: 'gamification.avatarAccessories.knowledgeCape',
    unlockLevel: 30,
    icon: '🦸',
    position: 'background',
    rarity: 'epic',
  },
];

// Helper functions
export function getUnlockedFrames(level: number): AvatarFrame[] {
  return AVATAR_FRAMES.filter((frame) => level >= frame.unlockLevel).map((frame) =>
    Object.assign(frame, { isUnlocked: true, isEquipped: false }),
  );
}

export function getUnlockedAccessories(level: number): AvatarAccessory[] {
  return AVATAR_ACCESSORIES.filter((accessory) => level >= accessory.unlockLevel).map((accessory) =>
    Object.assign(accessory, { isUnlocked: true, isEquipped: false }),
  );
}

export function getAllFrames(level: number): AvatarFrame[] {
  return AVATAR_FRAMES.map((frame) => ({
    ...frame,
    isUnlocked: level >= frame.unlockLevel,
    isEquipped: false,
  }));
}

export function getAllAccessories(level: number): AvatarAccessory[] {
  return AVATAR_ACCESSORIES.map((accessory) => ({
    ...accessory,
    isUnlocked: level >= accessory.unlockLevel,
    isEquipped: false,
  }));
}

export function getNextUnlock(level: number): AvatarUnlock | null {
  const allItems = [
    ...AVATAR_FRAMES.map((f) => ({ type: 'frame' as const, item: f, level: f.unlockLevel })),
    ...AVATAR_ACCESSORIES.map((a) => ({
      type: 'accessory' as const,
      item: a,
      level: a.unlockLevel,
    })),
  ];

  const nextItem = allItems.filter((item) => item.level > level).toSorted((a, b) => a.level - b.level)[0];

  if (!nextItem) return null;

  return {
    type: nextItem.type,
    item: {
      ...nextItem.item,
      isUnlocked: false,
      isEquipped: false,
    },
    unlockedAt: '',
    level: nextItem.level,
  };
}

export function getUnlockProgress(level: number): {
  unlocked: number;
  total: number;
  percentage: number;
} {
  const total = AVATAR_FRAMES.length + AVATAR_ACCESSORIES.length;
  const unlocked =
    AVATAR_FRAMES.filter((f) => level >= f.unlockLevel).length +
    AVATAR_ACCESSORIES.filter((a) => level >= a.unlockLevel).length;

  return {
    unlocked,
    total,
    percentage: total > 0 ? Math.round((unlocked / total) * 100) : 0,
  };
}

export function getRarityColor(rarity: 'common' | 'rare' | 'epic' | 'legendary'): string {
  switch (rarity) {
    case 'common': {
      return 'text-gray-500';
    }
    case 'rare': {
      return 'text-blue-500';
    }
    case 'epic': {
      return 'text-purple-500';
    }
    case 'legendary': {
      return 'text-orange-500';
    }
  }
}

export function getFrameById(id: string, level: number): AvatarFrame | null {
  const frame = AVATAR_FRAMES.find((f) => f.id === id);
  if (!frame) return null;

  return {
    ...frame,
    isUnlocked: level >= frame.unlockLevel,
    isEquipped: false,
  };
}

export function getAccessoryById(id: string, level: number): AvatarAccessory | null {
  const accessory = AVATAR_ACCESSORIES.find((a) => a.id === id);
  if (!accessory) return null;

  return {
    ...accessory,
    isUnlocked: level >= accessory.unlockLevel,
    isEquipped: false,
  };
}
