/**
 * Avatar Customization Types
 * Frames, accessories, and unlockable cosmetics
 */

// Avatar frame
export interface AvatarFrame {
  id: string
  name: string
  nameKey: string // Translation key
  unlockLevel: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  color: string // Border color class
  glowColor?: string // Optional glow effect
  isUnlocked: boolean
  isEquipped: boolean
}

// Avatar accessory
export interface AvatarAccessory {
  id: string
  name: string
  nameKey: string // Translation key
  unlockLevel: number
  icon: string // Emoji or icon identifier
  position: 'hat' | 'glasses' | 'badge' | 'background'
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  isUnlocked: boolean
  isEquipped: boolean
}

// Complete avatar customization
export interface AvatarCustomization {
  frame: AvatarFrame | null
  accessories: AvatarAccessory[]
  backgroundColor?: string
}

// Avatar unlock
export interface AvatarUnlock {
  type: 'frame' | 'accessory'
  item: AvatarFrame | AvatarAccessory
  unlockedAt: string // ISO timestamp
  level: number // Level when unlocked
}

// Avatar customization preset
export interface AvatarPreset {
  id: string
  name: string
  description: string
  customization: AvatarCustomization
  isDefault: boolean
}
