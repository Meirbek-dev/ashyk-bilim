'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar'
import { useSession } from '@/hooks/useSession'
import { useUserByUsername } from '@/lib/users/client'
import { DEFAULT_AVATAR_PATH, getAvatarInitials, resolveAvatarUrl } from '@services/media/avatar'
import { useTranslations } from 'next-intl'
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { memo, useMemo } from 'react'
import type { AvatarUser, PredefinedAvatar } from '@services/media/avatar'
import type { ComponentProps } from 'react'

import UserProfilePopup from './UserProfilePopup'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
export type AvatarVariant = 'default' | 'outline' | 'ghost'

export interface UserAvatarProps {
  size?: AvatarSize
  variant?: AvatarVariant
  avatar_url?: string
  use_with_session?: boolean
  predefined_avatar?: PredefinedAvatar
  showProfilePopup?: boolean
  userId?: number
  username?: string
  user?: AvatarUser | null
  className?: string
  fallbackText?: string
  imageProps?: Pick<ComponentProps<typeof AvatarImage>, 'loading' | 'decoding' | 'referrerPolicy'>
}

const sizeVariants = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-20 w-20 text-xl',
  '3xl': 'h-32 w-32 text-2xl',
}

const variantStyles = {
  default: 'ring-2 ring-background shadow-sm',
  outline: 'ring-1 ring-border',
  ghost: 'border-0',
}

const predefinedIcon = {
  ai: Bot,
  empty: User,
} satisfies Record<PredefinedAvatar, typeof User>

const UserAvatar = (props: UserAvatarProps) => {
  const t = useTranslations('Components.UserAvatar')
  const { user: currentUser } = useSession()

  const {
    size = 'md',
    variant = 'default',
    avatar_url,
    use_with_session = true,
    predefined_avatar,
    showProfilePopup,
    userId,
    username,
    user,
    className,
    fallbackText,
    imageProps,
  } = props

  const { data: userData } = useUserByUsername(username)

  const resolvedUser = useMemo<AvatarUser | null>(() => {
    if (user) return user
    if (userData) return userData
    if (username) return { username }
    return use_with_session ? currentUser : null
  }, [currentUser, use_with_session, user, userData, username])

  const avatarUrl = useMemo(
    () =>
      resolveAvatarUrl({
        avatarUrl: avatar_url,
        predefinedAvatar: predefined_avatar,
        user: resolvedUser,
      }),
    [avatar_url, predefined_avatar, resolvedUser],
  )

  const fallback = useMemo(
    () => getAvatarInitials(resolvedUser, fallbackText),
    [fallbackText, resolvedUser],
  )
  const PredefinedIcon = predefined_avatar ? predefinedIcon[predefined_avatar] : null

  const avatarElement = (
    <Avatar
      className={cn(
        sizeVariants[size],
        variantStyles[variant],
        'bg-muted text-foreground transition-colors',
        className,
      )}
    >
      <AvatarImage
        src={avatarUrl}
        alt={t('altText')}
        className="bg-muted"
        decoding={imageProps?.decoding ?? 'async'}
        loading={imageProps?.loading ?? (avatarUrl === DEFAULT_AVATAR_PATH ? 'eager' : 'lazy')}
        referrerPolicy={imageProps?.referrerPolicy ?? 'no-referrer'}
      />
      <AvatarFallback className="bg-muted text-muted-foreground font-medium">
        {PredefinedIcon ? <PredefinedIcon className="h-[55%] w-[55%]" /> : fallback}
      </AvatarFallback>
    </Avatar>
  )

  const popupUserId = useMemo(() => {
    if (userId) return userId
    if (username && currentUser?.username === username) return currentUser.id
    return userData?.id ?? null
  }, [userId, username, currentUser, userData])

  if (showProfilePopup && popupUserId) {
    return <UserProfilePopup userId={popupUserId}>{avatarElement}</UserProfilePopup>
  }

  return avatarElement
}

export default memo(UserAvatar)
