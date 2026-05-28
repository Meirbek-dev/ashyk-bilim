'use client'

import type { UserGamificationProfile } from '@/types/gamification'
import { AVATAR_UNLOCKS } from '@/lib/gamification/levels'
import { cn } from '@/lib/utils'

import UserAvatar from './UserAvatar'
import UserProfilePopup from './UserProfilePopup'
import type { UserAvatarProps } from './UserAvatar'

export type AvatarSize = UserAvatarProps['size']
export type AvatarVariant = UserAvatarProps['variant']

interface GamifiedUserAvatarProps extends Omit<UserAvatarProps, 'showProfilePopup'> {
  showProfilePopup?: boolean
  showLevelIndicator?: boolean
  showLevelBadge?: boolean
  gamificationProfile?: UserGamificationProfile | null
  levelIndicatorPosition?: 'top-right' | 'bottom-right' | 'bottom-center'
  showAvatarFrame?: boolean
  showAvatarAccessories?: boolean
}

const levelIndicatorSizes = {
  xs: 'h-2 w-2 text-[8px]',
  sm: 'h-3 w-3 text-[10px]',
  md: 'h-4 w-4 text-xs',
  lg: 'h-5 w-5 text-sm',
  xl: 'h-6 w-6 text-sm',
  '2xl': 'h-6 w-6 text-base',
  '3xl': 'h-9 w-9 text-lg',
}

// Disabled until the backend persists equipped frame and accessory ids.
const ENABLE_AVATAR_CUSTOMIZATION = false

const getHighestUnlock = <T extends { level: number }>(level: number, unlocks: readonly T[]) =>
  unlocks.filter(unlock => level >= unlock.level).at(-1) ?? null

const GamifiedUserAvatar = (props: GamifiedUserAvatarProps) => {
  const {
    size = 'md',
    className,
    showProfilePopup,
    userId,
    gamificationProfile,
    showLevelIndicator = false,
    showLevelBadge = false,
    levelIndicatorPosition = 'bottom-right',
    showAvatarFrame = false,
    showAvatarAccessories = false,
    ...avatarProps
  } = props

  const frame =
    ENABLE_AVATAR_CUSTOMIZATION && showAvatarFrame && gamificationProfile
      ? getHighestUnlock(gamificationProfile.level, AVATAR_UNLOCKS.frames)
      : null
  const accessory =
    ENABLE_AVATAR_CUSTOMIZATION && showAvatarAccessories && gamificationProfile
      ? getHighestUnlock(gamificationProfile.level, AVATAR_UNLOCKS.accessories)
      : null

  const avatarElement = (
    <span className="relative inline-flex">
      <UserAvatar
        {...avatarProps}
        size={size}
        userId={userId}
        showProfilePopup={false}
        className={cn(frame?.color && 'border-4', frame?.color, className)}
      />

      {accessory && (
        <span aria-hidden="true" className="absolute -top-1 -right-1 text-sm leading-none">
          {accessory.icon}
        </span>
      )}

      {showLevelBadge && gamificationProfile && (
        <span
          className={cn(
            'absolute z-10 flex items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow-sm ring-2 ring-background tabular-nums',
            levelIndicatorSizes[size],
            {
              '-top-1 -right-1': levelIndicatorPosition === 'top-right',
              '-right-1 -bottom-1': levelIndicatorPosition === 'bottom-right',
              'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2': levelIndicatorPosition === 'bottom-center',
            },
          )}
        >
          {gamificationProfile.level}
        </span>
      )}

      {showLevelIndicator && gamificationProfile && (
        <span
          aria-label={`Level ${gamificationProfile.level}`}
          className={cn(
            'absolute z-10 rounded-full bg-primary shadow-sm ring-2 ring-background',
            levelIndicatorSizes[size],
            {
              '-top-1 -right-1': levelIndicatorPosition === 'top-right',
              '-right-2 -bottom-2': levelIndicatorPosition === 'bottom-right',
              'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2': levelIndicatorPosition === 'bottom-center',
            },
          )}
        />
      )}
    </span>
  )

  if (showProfilePopup && userId) {
    return <UserProfilePopup userId={userId}>{avatarElement}</UserProfilePopup>
  }

  return avatarElement
}

export default GamifiedUserAvatar
